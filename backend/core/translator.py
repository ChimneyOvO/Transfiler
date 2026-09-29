import json
import re
import httpx
import asyncio
from typing import List, Dict, Any, Callable, Optional
from backend.core.glossary_matcher import GlossaryMatcher

def clean_api_key(key: str) -> str:
    """清理 API Key 中的空格、不可见字符、引号及前缀"""
    if not key:
        return ""
    k = key.strip().strip("\ufeff\u200b\u200c\u200d\u3000\r\n\t ")
    # 去除外层引号
    if (k.startswith('"') and k.endswith('"')) or (k.startswith("'") and k.endswith("'")):
        k = k[1:-1].strip()
    # 去除多余的 "Bearer " 前缀
    if k.lower().startswith("bearer "):
        k = k[7:].strip()
    return k

def clean_base_url(url: str) -> str:
    """标准化 Base URL"""
    if not url:
        return "https://api.deepseek.com/v1"
    u = url.strip().strip("\ufeff\u200b\u3000\r\n\t ")
    # 自动补齐协议头
    if not u.startswith("http://") and not u.startswith("https://"):
        u = "https://" + u
    u = u.rstrip("/")
    # 如果是 Gemini 官方根路径但未带 /openai，自动补齐 OpenAI 兼容端点
    if "generativelanguage.googleapis.com" in u and not u.endswith("/openai"):
        if u.endswith("/v1beta") or u.endswith("/v1"):
            u = f"{u}/openai"
        elif u == "https://generativelanguage.googleapis.com":
            u = "https://generativelanguage.googleapis.com/v1beta/openai"
    # 如果用户填入了完整的 /chat/completions 端点，自动去除
    if u.endswith("/chat/completions"):
        u = u[:-len("/chat/completions")].rstrip("/")
    return u

def parse_json_from_response(content: str) -> Dict[str, Any]:
    """从大模型返回的文本中稳健提取 JSON 字典"""
    if not content:
        return {}
    content = content.strip()
    # 1. 直接尝试 json.loads
    try:
        return json.loads(content)
    except Exception:
        pass

    # 2. 尝试从 ```json ... ``` 代码块中提取
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # 3. 尝试贪婪匹配最外层的 { ... }
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(content[start:end + 1])
        except Exception:
            pass

    return {}

class LLMTranslator:
    def __init__(self, api_key: str, base_url: str = "https://api.deepseek.com/v1", model_name: str = "deepseek-chat"):
        self.api_key = clean_api_key(api_key)
        self.base_url = clean_base_url(base_url)
        self.model_name = (model_name or "deepseek-chat").strip()

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    async def _post_request(self, payload: Dict[str, Any], timeout: float = 30.0) -> httpx.Response:
        """带 SSL 自动降级和多环境兼容的 POST 请求"""
        url = f"{self.base_url}/chat/completions"
        headers = self._get_headers()

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, trust_env=True) as client:
                return await client.post(url, headers=headers, json=payload)
        except (httpx.ConnectError, httpx.SecurityError, Exception) as e:
            # 在某些工业内网/防火墙/代理环境下，重试关闭 SSL 校验
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, verify=False, trust_env=True) as client:
                return await client.post(url, headers=headers, json=payload)

    async def _get_request(self, endpoint_url: str, timeout: float = 15.0) -> httpx.Response:
        """带 SSL 自动降级和多环境兼容的 GET 请求"""
        headers = self._get_headers()
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, trust_env=True) as client:
                return await client.get(endpoint_url, headers=headers)
        except (httpx.ConnectError, httpx.SecurityError, Exception) as e:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, verify=False, trust_env=True) as client:
                return await client.get(endpoint_url, headers=headers)

    async def fetch_models(self) -> Dict[str, Any]:
        """从配置的 API Base URL 拉取模型列表 (支持标准 OpenAI /models 以及各类兼容接口)"""
        if not self.base_url:
            return {
                "success": False,
                "message": "未配置 API 接口地址 (Base URL)",
                "models": []
            }

        url = f"{self.base_url}/models"
        try:
            resp = await self._get_request(url, timeout=15.0)

            # 如果 /models 报 404 且类似 Ollama 本地服务，尝试 /api/tags
            if resp.status_code == 404 and (":11434" in self.base_url or "localhost" in self.base_url or "127.0.0.1" in self.base_url):
                base_host = self.base_url.replace("/v1", "").rstrip("/")
                resp_ollama = await self._get_request(f"{base_host}/api/tags", timeout=10.0)
                if resp_ollama.status_code == 200:
                    resp = resp_ollama

            if resp.status_code == 200:
                try:
                    data_json = resp.json()
                except Exception:
                    return {
                        "success": False,
                        "message": "API 返回了非 JSON 格式的内容",
                        "models": []
                    }

                raw_list = []
                if isinstance(data_json, list):
                    raw_list = data_json
                elif isinstance(data_json, dict):
                    if "data" in data_json and isinstance(data_json["data"], list):
                        raw_list = data_json["data"]
                    elif "models" in data_json and isinstance(data_json["models"], list):
                        raw_list = data_json["models"]
                    elif "tags" in data_json and isinstance(data_json["tags"], list):
                        raw_list = data_json["tags"]

                parsed_models = []
                seen_ids = set()
                for item in raw_list:
                    model_id = ""
                    owned_by = ""
                    if isinstance(item, dict):
                        model_id = item.get("id") or item.get("name") or item.get("model") or ""
                        owned_by = item.get("owned_by") or ""
                    elif isinstance(item, str):
                        model_id = item

                    model_id = str(model_id).strip()
                    if model_id and model_id not in seen_ids:
                        seen_ids.add(model_id)
                        parsed_models.append({
                            "id": model_id,
                            "name": model_id,
                            "owned_by": owned_by
                        })

                # 排序优化：优先展示当前模型，其次常见对话模型，其余字母排序
                parsed_models.sort(key=lambda m: (
                    0 if m["id"] == self.model_name else 1,
                    0 if any(k in m["id"].lower() for k in ["chat", "deepseek", "gemini", "gpt", "qwen", "glm", "claude"]) else 1,
                    m["id"].lower()
                ))

                return {
                    "success": True,
                    "message": f"成功从 API 获取到 {len(parsed_models)} 个可用模型",
                    "total": len(parsed_models),
                    "models": parsed_models,
                    "current_model": self.model_name,
                    "base_url": self.base_url
                }

            # 非 200 处理
            status = resp.status_code
            err_text = resp.text[:200]
            try:
                err_text = resp.json().get("error", {}).get("message", err_text)
            except Exception:
                pass

            if status == 401:
                return {
                    "success": False,
                    "message": f"API 认证失败 (401 Unauthorized)：请检查 API Key 是否正确。\n{err_text}",
                    "models": []
                }
            elif status == 404:
                return {
                    "success": False,
                    "message": f"接口返回 404 (端点 {url} 不存在)。该服务商可能未开放 /models 路由，您可直接手动输入模型名称。",
                    "models": []
                }
            else:
                return {
                    "success": False,
                    "message": f"拉取模型列表失败 (HTTP {status}): {err_text}",
                    "models": []
                }

        except Exception as e:
            return {
                "success": False,
                "message": f"连接 API 获取模型异常: {str(e)}。若服务商未开放模型列表，您可直接手动输入模型名称。",
                "models": []
            }

    async def _post_request_with_retry(
        self,
        payload: Dict[str, Any],
        timeout: float = 60.0,
        max_retries: int = 3
    ) -> httpx.Response:
        """带自动指数退避重试的 POST 请求（自动克服 503 模型瞬时过载与 429 频控）"""
        retry_delays = [2.0, 4.0, 7.0]
        last_resp = None
        for attempt in range(max_retries + 1):
            try:
                resp = await self._post_request(payload, timeout=timeout)
                # 若正常成功或属于非重试型客户端错误 (如 400, 401)，直接返回
                if resp.status_code not in [429, 502, 503, 504]:
                    return resp
                last_resp = resp
            except Exception as e:
                if attempt == max_retries:
                    raise e

            # 若遇到 503 (Model Overloaded) 或 429 (Rate Limit)，执行指数退避重试
            if attempt < max_retries:
                delay = retry_delays[min(attempt, len(retry_delays) - 1)]
                if last_resp and "retry-after" in last_resp.headers:
                    try:
                        delay = max(delay, float(last_resp.headers["retry-after"]))
                    except Exception:
                        pass
                await asyncio.sleep(delay)

        return last_resp

    async def test_connection(self) -> Dict[str, Any]:
        """测试 API Key 与服务连通性（带详细诊断）"""
        if not self.api_key:
            return {"success": False, "message": "API Key 为空，请输入有效的 API 密钥"}

        # 使用最广泛兼容的测试 payload (仅包含 user 消息，不加 system，避免某些推理模型拒绝)
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "user", "content": "Hi"}
            ],
            "max_tokens": 16
        }

        try:
            resp = await self._post_request(payload, timeout=20.0)
            if resp.status_code == 200:
                return {
                    "success": True,
                    "message": f"连接成功！(Status: 200 OK) 模型「{self.model_name}」响应正常",
                    "cleaned_base_url": self.base_url
                }
            
            # 解析常见 HTTP 状态码并给出针对性提示
            status = resp.status_code
            err_body = resp.text
            try:
                err_json = resp.json()
                err_msg = err_json.get("error", {}).get("message", err_body)
            except Exception:
                err_msg = err_body

            if status == 401:
                return {
                    "success": False,
                    "message": f"API Key 认证失败 (401 Unauthorized)。\n请检查：\n1. 复制的 API Key 是否完整无误；\n2. 当前模型提供商是否与 Key 匹配；\n3. 新创建的 Key 是否已生效。\n接口返回: {err_msg}"
                }
            elif status == 403:
                return {
                    "success": False,
                    "message": f"访问被拒绝 (403 Forbidden)。\n可能原因：\n1. 如果使用 Google Gemini，由于区域合规限制，请确保代理软件开启全局海外节点；\n2. 请确认当前 API Key 拥有访问模型「{self.model_name}」的权限。\n接口返回: {err_msg}"
                }
            elif status in [402, 429]:
                return {
                    "success": False,
                    "message": f"请求受限或账户余额不足 ({status})。\n请登录服务商后台检查账户余额与充值状态。\n接口返回: {err_msg}"
                }
            elif status == 404:
                return {
                    "success": False,
                    "message": f"接口地址或模型未找到 (404 Not Found)。\n当前请求地址: {self.base_url}/chat/completions\n模型名称: {self.model_name}\n请核对 Base URL 与模型名称是否正确。"
                }
            elif status == 400:
                return {
                    "success": False,
                    "message": f"请求参数错误 (400 Bad Request)。\n可能原因: 模型「{self.model_name}」不存在或不支持该参数。\n接口返回: {err_msg}"
                }
            else:
                return {
                    "success": False,
                    "message": f"连接失败 (HTTP {status})。\n接口返回: {err_msg}"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"网络连接异常: 无法访问 {self.base_url}。\n请检查：\n1. 电脑是否能正常联网；\n2. 如需代理请确认代理状态；\n3. 工厂局域网是否有防火墙拦截。\n错误详情: {str(e)}"
            }

    async def translate_batch(
        self,
        items: List[Dict[str, Any]],
        target_lang_name: str,
        glossary_matcher: GlossaryMatcher,
        source_lang_name: str = "中文",
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[Dict[str, Any]]:
        """批量翻译条目"""
        # 1. 收集批次内的术语命中
        all_matched_terms = []
        for item in items:
            src = item.get("source_text", "").strip()
            if src:
                matched = glossary_matcher.match_terms_in_text(src)
                item["matched_terms"] = matched
                all_matched_terms.extend(matched)
            else:
                item["matched_terms"] = []
                item["target_text"] = ""

        # 去重
        unique_terms = []
        seen = set()
        for t in all_matched_terms:
            if t["source"] not in seen:
                unique_terms.append(t)
                seen.add(t["source"])

        term_constraints = glossary_matcher.build_prompt_constraint(unique_terms)

        # 2. 如果没有配置有效 API Key，则使用智能离线翻译规则
        if not self.api_key or self.api_key == "sk-mock-key":
            for idx, item in enumerate(items):
                src = item.get("source_text", "").strip()
                if not src:
                    item["target_text"] = ""
                else:
                    if item.get("matched_terms"):
                        item["target_text"] = f"[Mock {target_lang_name}] " + item["matched_terms"][0]["target"]
                    else:
                        item["target_text"] = f"[Trans {target_lang_name}] {src}"
                if progress_callback:
                    progress_callback(idx + 1, len(items))
            return items

        # 3. 构造请求给大模型进行批次翻译 (按 20 条分块)
        chunk_size = 20
        total_items = len(items)
        processed_count = 0

        for i in range(0, total_items, chunk_size):
            chunk = items[i:i + chunk_size]
            
            # 过滤出非空的待翻译文本
            query_payload = {}
            for it in chunk:
                s_text = it.get("source_text", "").strip()
                if not s_text:
                    continue
                query_payload[it["id"]] = s_text

            if query_payload:
                system_prompt = f"""你是一名精通制造业工程、工业制造 SOP 及质量体系（IATF 16949 / ISO）的资深工业翻译专家。
请将用户提供的 JSON 键值对中的【{source_lang_name}】内容翻译为【{target_lang_name}】。

要求：
1. 语言表达必须严谨、工业化、符合工程作业规范；
2. 保持简洁专业，不要添加任何额外的解释或引导词；
3. {term_constraints}
4. 必须直接返回与输入 JSON key 一一对应的 JSON 格式结果，格式如下：
{{
  "key1": "翻译结果1",
  "key2": "翻译结果2"
}}
"""
                # 首先尝试标准 JSON Mode 请求
                body = {
                    "model": self.model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(query_payload, ensure_ascii=False)}
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"}
                }

                parsed = {}
                try:
                    resp = await self._post_request_with_retry(body, timeout=60.0)
                    if resp.status_code == 200:
                        res_json = resp.json()
                        content = res_json["choices"][0]["message"]["content"]
                        parsed = parse_json_from_response(content)
                    elif resp.status_code == 400:
                        # 降级重试：去掉 response_format 重新请求（兼容不支持 json_object 的模型）
                        body_fallback = {
                            "model": self.model_name,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": json.dumps(query_payload, ensure_ascii=False)}
                            ],
                            "temperature": 0.2
                        }
                        resp2 = await self._post_request_with_retry(body_fallback, timeout=60.0)
                        if resp2.status_code == 200:
                            content2 = resp2.json()["choices"][0]["message"]["content"]
                            parsed = parse_json_from_response(content2)
                        else:
                            for it in chunk:
                                it["target_text"] = f"[翻译失败 {resp2.status_code}] " + it.get("source_text", "")
                    else:
                        err_label = f"翻译失败 {resp.status_code}"
                        if resp.status_code == 503:
                            err_label = "Gemini 503 谷歌模型瞬时负载过高，已自动重试多次仍繁忙，请稍候再试"
                        elif resp.status_code == 429:
                            err_label = "Gemini 429 触发免费额度限制(20次)或请求过频，请稍后重试"
                        for it in chunk:
                            it["target_text"] = f"[{err_label}] " + it.get("source_text", "")
                except Exception as e:
                    for it in chunk:
                        it["target_text"] = f"[翻译异常: {str(e)[:30]}] " + it.get("source_text", "")

                # 批次间平滑节流，避免瞬间突发请求打满 Google RPM
                if i + chunk_size < total_items:
                    await asyncio.sleep(0.6)

                # 填充解析出的结果
                if parsed:
                    for it in chunk:
                        it["target_text"] = parsed.get(it["id"], it["source_text"])

            processed_count += len(chunk)
            if progress_callback:
                progress_callback(min(processed_count, total_items), total_items)

        return items
