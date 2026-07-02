// Cole este arquivo inteiro no console do DevTools do navegador em despezzas.com.
// Ele registra chamadas fetch/XHR para api.despezzas.com e expõe:
//   window.__despezzasMcpMonitor.download()
//   window.__despezzasMcpMonitor.copy()
//   window.__despezzasMcpMonitor.report()
(() => {
  const TARGET_HOST = "api.despezzas.com";
  const MAX_TEXT_LENGTH = 12000;
  const previous = window.__despezzasMcpMonitor;
  if (previous && typeof previous.stop === "function") {
    previous.stop();
  }

  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const entries = [];

  function nowIso() {
    return new Date().toISOString();
  }

  function isTargetUrl(value) {
    try {
      return new URL(value, window.location.href).host === TARGET_HOST;
    } catch {
      return false;
    }
  }

  function normalizeUrl(value) {
    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return String(value);
    }
  }

  function clip(text) {
    if (typeof text !== "string") return text;
    return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}...[truncado]` : text;
  }

  function redactString(text) {
    if (typeof text !== "string") return text;
    return text
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [mascarado]")
      .replace(/("(?:idToken|refreshToken|firebase_token|token|password|authorization|credential|secret)"\s*:\s*)"[^"]*"/gi, '$1"[mascarado]"')
      .replace(/((?:idToken|refreshToken|firebase_token|token|password|authorization|credential|secret)=)[^&\s]*/gi, "$1[mascarado]");
  }

  function redactHeaders(headers) {
    const redacted = {};
    for (const [key, value] of Object.entries(headers || {})) {
      redacted[key] = /authorization|token|password|credential|secret/i.test(key) ? "[mascarado]" : value;
    }
    return redacted;
  }

  function headersToObject(headers) {
    const out = {};
    if (!headers) return out;

    try {
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          out[key] = value;
        });
        return out;
      }

      if (Array.isArray(headers)) {
        for (const [key, value] of headers) out[key] = value;
        return out;
      }

      return { ...headers };
    } catch {
      return out;
    }
  }

  async function bodyToText(body) {
    if (body === undefined || body === null) return undefined;
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      const out = {};
      body.forEach((value, key) => {
        out[key] = value instanceof File ? `[arquivo:${value.name}]` : value;
      });
      return JSON.stringify(out);
    }
    if (body instanceof Blob) return `[blob:${body.type || "desconhecido"}:${body.size}]`;
    if (body instanceof ArrayBuffer) return `[arraybuffer:${body.byteLength}]`;
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }

  function record(entry) {
    entries.push({
      captured_at: nowIso(),
      ...entry,
      request_headers: redactHeaders(entry.request_headers),
      response_headers: redactHeaders(entry.response_headers),
      request_body: clip(redactString(entry.request_body)),
      response_body: clip(redactString(entry.response_body)),
    });
  }

  window.fetch = async function monitoredFetch(input, init) {
    const request = input instanceof Request ? input : undefined;
    const url = normalizeUrl(request ? request.url : input);
    const method = (init && init.method) || (request && request.method) || "GET";
    const requestHeaders = {
      ...headersToObject(request && request.headers),
      ...headersToObject(init && init.headers),
    };
    const shouldRecord = isTargetUrl(url);
    const started = performance.now();
    let requestBody;

    if (shouldRecord) {
      try {
        requestBody = init && "body" in init ? await bodyToText(init.body) : request ? await request.clone().text() : undefined;
      } catch (error) {
        requestBody = `[corpo da requisição ilegível: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }

    try {
      const response = await originalFetch.apply(this, arguments);
      if (shouldRecord) {
        let responseBody;
        try {
          responseBody = await response.clone().text();
        } catch (error) {
          responseBody = `[corpo da resposta ilegível: ${error instanceof Error ? error.message : String(error)}]`;
        }
        record({
          transport: "fetch",
          method,
          url,
          status: response.status,
          duration_ms: Math.round(performance.now() - started),
          request_headers: requestHeaders,
          request_body: requestBody,
          response_headers: headersToObject(response.headers),
          response_body: responseBody,
        });
      }
      return response;
    } catch (error) {
      if (shouldRecord) {
        record({
          transport: "fetch",
          method,
          url,
          status: "erro-de-rede",
          duration_ms: Math.round(performance.now() - started),
          request_headers: requestHeaders,
          request_body: requestBody,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  };

  XMLHttpRequest.prototype.open = function monitoredOpen(method, url) {
    this.__despezzasMcpMonitor = {
      method,
      url: normalizeUrl(url),
      request_headers: {},
      started: 0,
    };
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function monitoredSetRequestHeader(key, value) {
    if (this.__despezzasMcpMonitor) {
      this.__despezzasMcpMonitor.request_headers[key] = value;
    }
    return originalXhrSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function monitoredSend(body) {
    const meta = this.__despezzasMcpMonitor;
    if (meta && isTargetUrl(meta.url)) {
      meta.started = performance.now();
      bodyToText(body)
        .then((text) => {
          meta.request_body = text;
        })
        .catch((error) => {
          meta.request_body = `[corpo da requisição ilegível: ${error instanceof Error ? error.message : String(error)}]`;
        });

      this.addEventListener("loadend", () => {
        let responseBody;
        try {
          responseBody = this.responseType && this.responseType !== "text" ? `[tipoResposta:${this.responseType}]` : this.responseText;
        } catch (error) {
          responseBody = `[corpo da resposta ilegível: ${error instanceof Error ? error.message : String(error)}]`;
        }
        record({
          transport: "xhr",
          method: meta.method,
          url: meta.url,
          status: this.status,
          duration_ms: Math.round(performance.now() - meta.started),
          request_headers: meta.request_headers,
          request_body: meta.request_body,
          response_body: responseBody,
        });
      });
    }
    return originalXhrSend.apply(this, arguments);
  };

  function report() {
    return {
      source: "monitor de requisições DevTools do despezzas-mcp",
      started_at: startedAt,
      exported_at: nowIso(),
      page: window.location.href,
      count: entries.length,
      entries,
    };
  }

  async function copyReport() {
    const text = JSON.stringify(report(), null, 2);
    await navigator.clipboard.writeText(text);
    console.info(`${entries.length} entradas da API Despezzas copiadas para a área de transferência.`);
  }

  function downloadReport(filename = "despezzas-api-report.json") {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stop() {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXhrOpen;
    XMLHttpRequest.prototype.send = originalXhrSend;
    XMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
    console.info("Monitor de requisições do Despezzas MCP interrompido.");
  }

  const startedAt = nowIso();
  window.__despezzasMcpMonitor = {
    entries,
    report,
    copy: copyReport,
    download: downloadReport,
    clear: () => {
      entries.splice(0, entries.length);
      console.info("Monitor de requisições do Despezzas MCP limpo.");
    },
    stop,
  };

  console.info(
    "O monitor de requisições do Despezzas MCP está registrando chamadas para api.despezzas.com. Execute window.__despezzasMcpMonitor.download() para exportar JSON.",
  );
})();
