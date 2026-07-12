// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/utils/body.js
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/utils/url.js
var splitPath = (path3) => {
  const paths = path3.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path: path3 } = extractGroupsFromPath(routePath);
  const paths = splitPath(path3);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path3) => {
  const groups = [];
  path3 = path3.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path: path3 };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path3 = url.slice(start, end);
      return tryDecodeURI(path3.includes("%25") ? path3.replace(/%25/g, "%2525") : path3);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path3) => {
  if (path3.charCodeAt(path3.length - 1) !== 63 || !path3.includes(":")) {
    return null;
  }
  const segments = path3.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path3 = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path3;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path3, ...handlers) => {
      for (const p of [path3].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path3, app2) {
    const subApp = this.basePath(path3);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path3) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path3);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path3, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path3);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path3, "*"), handler);
    return this;
  }
  #addRoute(method, path3, handler, baseRoutePath) {
    method = method.toUpperCase();
    path3 = mergePath(this._basePath, path3);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path: path3,
      method,
      handler
    };
    this.router.add(method, path3, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path3 = this.getPath(request, { env });
    const matchResult = this.router.match(method, path3);
    const c = new Context(request, {
      path: path3,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path3) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path22) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path22];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path22.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path3);
}

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path3, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path3 = path3.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path3.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path3) {
  return wildcardRegExpCache[path3] ??= new RegExp(
    path3 === "*" ? "" : `^${path3.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path3, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path3] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path3, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path3) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path3) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path3)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path3, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path3 === "/*") {
      path3 = "*";
    }
    const paramCount = (path3.match(/\/:/g) || []).length;
    if (/\*$/.test(path3)) {
      const re = buildWildcardRegExp(path3);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path3] ||= findMiddleware(middleware[m], path3) || findMiddleware(middleware[METHOD_NAME_ALL], path3) || [];
        });
      } else {
        middleware[method][path3] ||= findMiddleware(middleware[method], path3) || findMiddleware(middleware[METHOD_NAME_ALL], path3) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path3) || [path3];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path22 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path22] ||= [
            ...findMiddleware(middleware[m], path22) || findMiddleware(middleware[METHOD_NAME_ALL], path22) || []
          ];
          routes[m][path22].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path3) => [path3, r[method][path3]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path3) => [path3, r[METHOD_NAME_ALL][path3]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path3, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path3, handler]);
  }
  match(method, path3) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path3);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path3, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path3);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path3) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path3);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path3[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path3.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path3, handler) {
    const results = checkOptionalParameter(path3);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path3, handler);
  }
  match(method, path3) {
    return this.#node.search(method, path3);
  }
};

// node_modules/.pnpm/hono@4.12.29/node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// apps/api/src/db.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
var REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
var DATA_DIR = process.env.WT_DATA_DIR ?? path.join(REPO_ROOT, "data");
var PARQUET_DIR = path.join(DATA_DIR, "parquet");
var REMOTE_DATA = Boolean(process.env.WT_DATA_BASE_URL) || process.env.VERCEL === "1";
var conn = null;
var chain = Promise.resolve();
async function initDb() {
  const instance = await DuckDBInstance.create(":memory:");
  conn = await instance.connect();
  if (REMOTE_DATA) {
    await conn.run(`SET home_directory = '/tmp'`);
    await conn.run(`SET extension_directory = '/tmp/duckdb-extensions'`);
    await conn.run(`SET temp_directory = '/tmp/duckdb-spill'`);
    await conn.run(`SET memory_limit = '768MB'`);
    await conn.run(`SET threads = 2`);
    await conn.run(`INSTALL httpfs`);
    await conn.run(`LOAD httpfs`);
  } else {
    await conn.run(`SET memory_limit = '2GB'`);
    await conn.run(`SET threads = 4`);
  }
}
function query(sql) {
  const run = async () => {
    if (!conn) throw new Error("db not initialized");
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjects();
  };
  const next = chain.then(run, run);
  chain = next.catch(() => void 0);
  return next;
}
async function exec(sql) {
  await query(sql);
}

// apps/api/src/datasets.ts
import fs from "node:fs";
import path2 from "node:path";

// packages/shared/src/hs-chapters.ts
var HS_CHAPTERS = {
  "01": "Live animals",
  "02": "Meat & edible meat offal",
  "03": "Fish & crustaceans",
  "04": "Dairy, eggs & honey",
  "05": "Other products of animal origin",
  "06": "Live plants & cut flowers",
  "07": "Vegetables",
  "08": "Fruit & nuts",
  "09": "Coffee, tea, mat\xE9 & spices",
  "10": "Cereals",
  "11": "Milling products, malt & starches",
  "12": "Oil seeds & oleaginous fruits",
  "13": "Lac, gums & resins",
  "14": "Vegetable plaiting materials",
  "15": "Animal & vegetable fats and oils",
  "16": "Preparations of meat & fish",
  "17": "Sugars & sugar confectionery",
  "18": "Cocoa & cocoa preparations",
  "19": "Preparations of cereals, flour & milk",
  "20": "Preparations of vegetables & fruit",
  "21": "Miscellaneous edible preparations",
  "22": "Beverages, spirits & vinegar",
  "23": "Food-industry residues & animal feed",
  "24": "Tobacco",
  "25": "Salt, sulphur, earths & stone",
  "26": "Ores, slag & ash",
  "27": "Mineral fuels & oils",
  "28": "Inorganic chemicals",
  "29": "Organic chemicals",
  "30": "Pharmaceutical products",
  "31": "Fertilisers",
  "32": "Tanning & dyeing extracts, pigments",
  "33": "Essential oils, perfumery & cosmetics",
  "34": "Soap & washing preparations",
  "35": "Albuminoids, starches & glues",
  "36": "Explosives & pyrotechnics",
  "37": "Photographic & cinematographic goods",
  "38": "Miscellaneous chemical products",
  "39": "Plastics",
  "40": "Rubber",
  "41": "Raw hides, skins & leather",
  "42": "Articles of leather",
  "43": "Furskins & artificial fur",
  "44": "Wood & articles of wood",
  "45": "Cork",
  "46": "Basketware & wickerwork",
  "47": "Pulp of wood",
  "48": "Paper & paperboard",
  "49": "Printed books & newspapers",
  "50": "Silk",
  "51": "Wool & fine animal hair",
  "52": "Cotton",
  "53": "Other vegetable textile fibres",
  "54": "Man-made filaments",
  "55": "Man-made staple fibres",
  "56": "Wadding, felt & nonwovens",
  "57": "Carpets",
  "58": "Special woven fabrics",
  "59": "Impregnated & coated fabrics",
  "60": "Knitted or crocheted fabrics",
  "61": "Apparel, knitted or crocheted",
  "62": "Apparel, not knitted",
  "63": "Other made-up textile articles",
  "64": "Footwear",
  "65": "Headgear",
  "66": "Umbrellas & walking-sticks",
  "67": "Prepared feathers & artificial flowers",
  "68": "Articles of stone, plaster & cement",
  "69": "Ceramic products",
  "70": "Glass & glassware",
  "71": "Precious stones & metals",
  "72": "Iron & steel",
  "73": "Articles of iron or steel",
  "74": "Copper",
  "75": "Nickel",
  "76": "Aluminium",
  "78": "Lead",
  "79": "Zinc",
  "80": "Tin",
  "81": "Other base metals & cermets",
  "82": "Tools & cutlery of base metal",
  "83": "Miscellaneous articles of base metal",
  "84": "Machinery & mechanical appliances",
  "85": "Electrical machinery & equipment",
  "86": "Railway locomotives & rolling stock",
  "87": "Vehicles",
  "88": "Aircraft & spacecraft",
  "89": "Ships & boats",
  "90": "Optical, medical & precision instruments",
  "91": "Clocks & watches",
  "92": "Musical instruments",
  "93": "Arms & ammunition",
  "94": "Furniture, lighting & prefab buildings",
  "95": "Toys, games & sports equipment",
  "96": "Miscellaneous manufactured articles",
  "97": "Works of art & antiques",
  "99": "Commodities not specified by kind"
};

// apps/api/src/datasets.ts
var DEFAULT_REMOTE_BASE = "https://github.com/phbelov/world-trade-app/releases/download/data-v1";
var catalog = null;
function getCatalog() {
  if (!catalog) throw new Error("catalog not initialized");
  return catalog;
}
var localSource = {
  async manifests() {
    if (!fs.existsSync(PARQUET_DIR)) {
      throw new Error(
        `No data at ${PARQUET_DIR} \u2014 run the ingest pipeline first (see README)`
      );
    }
    return fs.readdirSync(PARQUET_DIR).map((dir) => path2.join(PARQUET_DIR, dir, "manifest.json")).filter((p) => fs.existsSync(p)).map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
  },
  cube: (id, name) => `read_parquet('${path2.join(PARQUET_DIR, id, "cubes", name, "*", "*.parquet")}', hive_partitioning = true)`,
  facts: (id, year) => `read_parquet('${path2.join(PARQUET_DIR, id, "facts", `year=${year}`, "*.parquet")}')`,
  dim: (id, name) => `read_parquet('${path2.join(PARQUET_DIR, id, "dims", `${name}.parquet`)}')`
};
function remoteSource(base) {
  return {
    async manifests() {
      const res = await fetch(`${base}/datasets.json`);
      if (!res.ok) {
        throw new Error(`failed to fetch ${base}/datasets.json: ${res.status}`);
      }
      return await res.json();
    },
    cube: (id, name) => `read_parquet('${base}/cube-${id}-${name}.parquet')`,
    facts: (id, year) => `read_parquet('${base}/facts-${id}-${year}.parquet')`,
    dim: (id, name) => `read_parquet('${base}/dims-${id}-${name}.parquet')`
  };
}
async function initCatalog() {
  const source = REMOTE_DATA ? remoteSource(process.env.WT_DATA_BASE_URL ?? DEFAULT_REMOTE_BASE) : localSource;
  const datasets = await source.manifests();
  const baci = datasets.find((d) => d.provider === "baci");
  if (!baci) throw new Error("BACI dataset missing \u2014 run `pnpm ingest baci:all`");
  const provisional = datasets.find(
    (d) => d.provider === "comtrade" && d.provisional
  );
  await exec(`
    CREATE OR REPLACE VIEW dim_countries AS
    SELECT * FROM ${source.dim(baci.id, "countries")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW dim_products AS
    SELECT * FROM ${source.dim(baci.id, "products")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW dim_chapters AS
    SELECT DISTINCT hs2, coalesce(section, 'other') AS section,
           coalesce(section_name, 'Unspecified') AS section_name
    FROM dim_products
  `);
  const chapterValues = Object.entries(HS_CHAPTERS).map(([code, name]) => `('${code}', '${name.replace(/'/g, "''")}')`).join(",\n      ");
  await exec(`
    CREATE OR REPLACE VIEW dim_chapter_names AS
    SELECT * FROM (VALUES
      ${chapterValues}
    ) AS t(hs2, chapter_name)
  `);
  const baciCube = (name) => source.cube(baci.id, name);
  const provCube = (name) => provisional ? source.cube(provisional.id, name) : null;
  const totalsProv = provCube("country_totals");
  await exec(`
    CREATE OR REPLACE VIEW v_country_totals AS
    SELECT year, country, exports_usd, imports_usd,
           export_partners, import_partners,
           false AS provisional, NULL AS exports_source
    FROM ${baciCube("country_totals")}
    ${totalsProv ? `UNION ALL
    SELECT year, country, exports_usd, imports_usd,
           export_partners, import_partners,
           true, exports_source
    FROM ${totalsProv}` : ""}
  `);
  const bilateralProv = provCube("bilateral");
  await exec(`
    CREATE OR REPLACE VIEW v_bilateral AS
    SELECT year, exporter, importer, value_usd, false AS provisional
    FROM ${baciCube("bilateral")}
    ${bilateralProv ? `UNION ALL
    SELECT year, exporter, importer, value_usd, true FROM ${bilateralProv}` : ""}
  `);
  const hs2Prov = provCube("country_flow_hs2");
  await exec(`
    CREATE OR REPLACE VIEW v_country_flow_hs2 AS
    SELECT year, country, flow, hs2, value_usd, false AS provisional
    FROM ${baciCube("country_flow_hs2")}
    ${hs2Prov ? `UNION ALL
    SELECT year, country, flow, hs2, value_usd, true FROM ${hs2Prov}` : ""}
  `);
  const bilateralHs2Prov = provCube("bilateral_hs2");
  await exec(`
    CREATE OR REPLACE VIEW v_bilateral_hs2 AS
    SELECT year, exporter, importer, hs2, value_usd, false AS provisional
    FROM ${baciCube("bilateral_hs2")}
    ${bilateralHs2Prov ? `UNION ALL
    SELECT year, exporter, importer, hs2, value_usd, true FROM ${bilateralHs2Prov}` : ""}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_country_flow_hs4 AS
    SELECT * FROM ${baciCube("country_flow_hs4")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_product_world AS
    SELECT * FROM ${baciCube("product_world")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_metrics_country AS
    SELECT * FROM ${baciCube("metrics_country")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_import_dependency AS
    SELECT * FROM ${baciCube("import_dependency")}
  `);
  const years = [];
  for (let y = baci.firstYear; y <= baci.lastYear; y++) {
    years.push({ year: y, provisional: false });
  }
  if (provisional) {
    for (let y = provisional.firstYear; y <= provisional.lastYear; y++) {
      if (y > baci.lastYear) years.push({ year: y, provisional: true });
    }
  }
  catalog = {
    datasets,
    years,
    defaultYear: baci.lastYear,
    hasProvisional: Boolean(provisional),
    factsExprForYear: (year) => source.facts(baci.id, year)
  };
  return catalog;
}

// apps/api/src/lib.ts
var num = (v) => Number(v);
var numOrNull = (v) => v == null ? null : Number(v);
async function resolveCountry(iso3) {
  const rows = await query(`
    SELECT code, display_name, valid_until FROM dim_countries
    WHERE iso3 = '${iso3}' ORDER BY valid_until NULLS LAST
  `);
  if (rows.length === 0) return null;
  const current = rows.find((r) => r.valid_until == null) ?? rows[0];
  return {
    iso3,
    codes: rows.map((r) => num(r.code)),
    name: current.display_name,
    entityNotes: rows.filter((r) => r.valid_until != null && num(r.code) !== num(current.code)).map((r) => ({
      throughYear: num(r.valid_until),
      note: `Reported as ${r.display_name} through ${num(r.valid_until)}`
    }))
  };
}
var inCodes = (codes) => `(${codes.join(", ")})`;
var ISO3_RE = /^[A-Z]{3}$/;
var HS_CODE_RE = /^[0-9]{2}([0-9]{2}([0-9A-Z]{2})?)?$/;
var sqlString = (s) => s.replace(/'/g, "''");

// apps/api/src/routes/pair.ts
var PRODUCT_LIMIT = 500;
async function directionProducts(exporter, importer, year, provisional) {
  if (provisional) {
    const rows2 = await query(`
      SELECT b.hs2 AS code, cn.chapter_name AS name,
             sum(b.value_usd) AS v, count(*) OVER () AS n
      FROM v_bilateral_hs2 b
      JOIN dim_chapter_names cn ON b.hs2 = cn.hs2
      WHERE b.year = ${year}
        AND b.exporter IN ${inCodes(exporter.codes)}
        AND b.importer IN ${inCodes(importer.codes)}
      GROUP BY 1, 2 ORDER BY v DESC
    `);
    const total2 = rows2.reduce((s, r) => s + num(r.v), 0);
    return {
      products: rows2.map((r) => ({
        code: r.code,
        name: r.name,
        level: "hs2",
        valueUsd: num(r.v),
        share: total2 > 0 ? num(r.v) / total2 : 0
      })),
      productCount: rows2.length === 0 ? 0 : num(rows2[0].n)
    };
  }
  const rows = await query(`
    SELECT f.hs6 AS code, p.name, sum(f.value_usd) AS v, count(*) OVER () AS n
    FROM ${getCatalog().factsExprForYear(year)} f
    JOIN dim_products p USING (hs6)
    WHERE f.exporter IN ${inCodes(exporter.codes)}
      AND f.importer IN ${inCodes(importer.codes)}
    GROUP BY 1, 2 ORDER BY v DESC
    LIMIT ${PRODUCT_LIMIT}
  `);
  const [tot] = await query(`
    SELECT sum(value_usd) AS t FROM v_bilateral
    WHERE year = ${year}
      AND exporter IN ${inCodes(exporter.codes)}
      AND importer IN ${inCodes(importer.codes)}
  `);
  const total = numOrNull(tot?.t) ?? 0;
  return {
    products: rows.map((r) => ({
      code: r.code,
      name: r.name,
      level: "hs6",
      valueUsd: num(r.v),
      share: total > 0 ? num(r.v) / total : 0
    })),
    productCount: rows.length === 0 ? 0 : num(rows[0].n)
  };
}
function registerPairRoutes(app2) {
  app2.get("/api/pair/:a/:b", async (c) => {
    const aIso = c.req.param("a").toUpperCase();
    const bIso = c.req.param("b").toUpperCase();
    if (!ISO3_RE.test(aIso) || !ISO3_RE.test(bIso) || aIso === bIso) {
      return c.json({ error: "invalid country pair" }, 400);
    }
    const catalog2 = getCatalog();
    const year = Number(c.req.query("year") ?? catalog2.defaultYear);
    const yearInfo = catalog2.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const [a, b] = await Promise.all([
      resolveCountry(aIso),
      resolveCountry(bIso)
    ]);
    if (!a || !b) return c.json({ error: "unknown country" }, 404);
    const [totals] = await query(`
      SELECT
        sum(value_usd) FILTER (
          exporter IN ${inCodes(a.codes)} AND importer IN ${inCodes(b.codes)}
        ) AS ab,
        sum(value_usd) FILTER (
          exporter IN ${inCodes(b.codes)} AND importer IN ${inCodes(a.codes)}
        ) AS ba
      FROM v_bilateral WHERE year = ${year}
    `);
    const [exportTotals] = await query(`
      SELECT
        sum(exports_usd) FILTER (country IN ${inCodes(a.codes)}) AS ax,
        sum(exports_usd) FILTER (country IN ${inCodes(b.codes)}) AS bx
      FROM v_country_totals WHERE year = ${year}
    `);
    const abUsd = numOrNull(totals?.ab);
    const baUsd = numOrNull(totals?.ba);
    const ax = numOrNull(exportTotals?.ax);
    const bx = numOrNull(exportTotals?.bx);
    const [aProducts, bProducts] = [
      await directionProducts(a, b, year, yearInfo.provisional),
      await directionProducts(b, a, year, yearInfo.provisional)
    ];
    const summary = {
      a: { iso3: aIso, name: a.name },
      b: { iso3: bIso, name: b.name },
      year,
      provisional: yearInfo.provisional,
      aToB: {
        totalUsd: abUsd,
        shareOfExportsTotal: abUsd != null && ax ? abUsd / ax : null,
        ...aProducts
      },
      bToA: {
        totalUsd: baUsd,
        shareOfExportsTotal: baUsd != null && bx ? baUsd / bx : null,
        ...bProducts
      },
      entityNotes: [...a.entityNotes, ...b.entityNotes]
    };
    return c.json(summary);
  });
  app2.get("/api/pair/:a/:b/trend", async (c) => {
    const aIso = c.req.param("a").toUpperCase();
    const bIso = c.req.param("b").toUpperCase();
    if (!ISO3_RE.test(aIso) || !ISO3_RE.test(bIso) || aIso === bIso) {
      return c.json({ error: "invalid country pair" }, 400);
    }
    const [a, b] = await Promise.all([
      resolveCountry(aIso),
      resolveCountry(bIso)
    ]);
    if (!a || !b) return c.json({ error: "unknown country" }, 404);
    const rows = await query(`
      SELECT year,
        sum(value_usd) FILTER (
          exporter IN ${inCodes(a.codes)} AND importer IN ${inCodes(b.codes)}
        ) AS ab,
        sum(value_usd) FILTER (
          exporter IN ${inCodes(b.codes)} AND importer IN ${inCodes(a.codes)}
        ) AS ba,
        bool_or(provisional) AS prov
      FROM v_bilateral
      WHERE (exporter IN ${inCodes(a.codes)} AND importer IN ${inCodes(b.codes)})
         OR (exporter IN ${inCodes(b.codes)} AND importer IN ${inCodes(a.codes)})
      GROUP BY year ORDER BY year
    `);
    const trend = {
      a: { iso3: aIso, name: a.name },
      b: { iso3: bIso, name: b.name },
      points: rows.map((r) => ({
        year: num(r.year),
        aToBUsd: numOrNull(r.ab),
        bToAUsd: numOrNull(r.ba),
        provisional: Boolean(r.prov)
      })),
      entityNotes: [...a.entityNotes, ...b.entityNotes]
    };
    return c.json(trend);
  });
}

// apps/api/src/routes/product.ts
var UNIT_VALUE_MIN_COVERAGE = 0.5;
function levelOf(code) {
  return code.length === 2 ? "hs2" : code.length === 4 ? "hs4" : "hs6";
}
async function productInfo(code) {
  const level = levelOf(code);
  const hs2 = code.slice(0, 2);
  const [chapter] = await query(
    `SELECT chapter_name FROM dim_chapter_names WHERE hs2 = '${hs2}'`
  );
  if (!chapter) return null;
  const [section] = await query(
    `SELECT DISTINCT section, section_name FROM dim_chapters WHERE hs2 = '${hs2}'`
  );
  let name;
  if (level === "hs6") {
    const [p] = await query(
      `SELECT name FROM dim_products WHERE hs6 = '${code}'`
    );
    if (!p) return null;
    name = p.name;
  } else if (level === "hs4") {
    const [child] = await query(
      `SELECT count(*) AS n FROM dim_products WHERE hs4 = '${code}'`
    );
    if (!child || num(child.n) === 0) return null;
    name = `Heading ${code} \xB7 ${chapter.chapter_name}`;
  } else {
    name = chapter.chapter_name;
  }
  return {
    code,
    level,
    name,
    sectionId: section?.section ?? null,
    sectionName: section?.section_name ?? null,
    chapterCode: hs2,
    chapterName: chapter.chapter_name
  };
}
var hs6Match = (code) => code.length === 6 ? `hs6 = '${code}'` : `starts_with(hs6, '${code}')`;
async function topCountries(code, year, flow, worldTotal) {
  const level = levelOf(code);
  let rows;
  if (level === "hs6") {
    const side = flow === "X" ? "exporter" : "importer";
    rows = await query(`
      SELECT c.iso3, c.display_name AS name, sum(f.value_usd) AS v
      FROM ${getCatalog().factsExprForYear(year)} f
      JOIN dim_countries c ON f.${side} = c.code
      WHERE f.hs6 = '${code}'
      GROUP BY 1, 2 ORDER BY v DESC LIMIT 15
    `);
  } else {
    const view = level === "hs4" ? "v_country_flow_hs4" : "v_country_flow_hs2";
    const col = level === "hs4" ? "hs4" : "hs2";
    rows = await query(`
      SELECT c.iso3, c.display_name AS name, sum(f.value_usd) AS v
      FROM ${view} f
      JOIN dim_countries c ON f.country = c.code
      WHERE f.${col} = '${code}' AND f.flow = '${flow}' AND f.year = ${year}
        ${level === "hs2" ? "AND NOT f.provisional" : ""}
      GROUP BY 1, 2 ORDER BY v DESC LIMIT 15
    `);
  }
  return rows.map((r) => ({
    iso3: r.iso3,
    name: r.name,
    valueUsd: num(r.v),
    share: worldTotal > 0 ? num(r.v) / worldTotal : 0
  }));
}
function registerProductRoutes(app2) {
  app2.get("/api/products/search", async (c) => {
    const raw2 = (c.req.query("q") ?? "").trim();
    if (raw2.length < 2) return c.json([]);
    const q = sqlString(raw2.replace(/[%_]/g, ""));
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 30);
    const rows = await query(`
      SELECT code, name, level FROM (
        SELECT hs2 AS code, chapter_name AS name, 'hs2' AS level,
          CASE
            WHEN hs2 = '${q}' THEN 0
            WHEN chapter_name ILIKE '${q}%' THEN 1
            WHEN chapter_name ILIKE '%${q}%' THEN 3
          END AS rank
        FROM dim_chapter_names
        UNION ALL
        SELECT hs6, name, 'hs6',
          CASE
            WHEN hs6 = '${q}' THEN 0
            WHEN hs6 LIKE '${q}%' THEN 2
            WHEN name ILIKE '${q}%' THEN 2
            WHEN name ILIKE '%${q}%' THEN 4
          END
        FROM dim_products
      )
      WHERE rank IS NOT NULL
      ORDER BY rank, level, code
      LIMIT ${limit}
    `);
    return c.json(
      rows.map(({ code, name, level }) => ({ code, name, level }))
    );
  });
  app2.get("/api/product/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!HS_CODE_RE.test(code)) return c.json({ error: "invalid HS code" }, 400);
    const catalog2 = getCatalog();
    const year = Number(c.req.query("year") ?? catalog2.defaultYear);
    const yearInfo = catalog2.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    if (yearInfo.provisional) {
      return c.json(
        { error: "product detail requires reconciled data; pick an earlier year" },
        400
      );
    }
    const info = await productInfo(code);
    if (!info) return c.json({ error: "unknown HS code" }, 404);
    const [world] = await query(`
      SELECT sum(value_usd) AS v, sum(quantity_tonnes) AS q,
             sum(value_usd * coalesce(quantity_value_coverage, 0)) / sum(value_usd) AS cov
      FROM v_product_world
      WHERE year = ${year} AND ${hs6Match(code)}
    `);
    const worldTradeUsd = numOrNull(world?.v) ?? 0;
    const coverage = info.level === "hs6" ? numOrNull(world?.cov) : null;
    const tonnes = numOrNull(world?.q);
    const unitValue = info.level === "hs6" && coverage != null && coverage >= UNIT_VALUE_MIN_COVERAGE && tonnes ? worldTradeUsd * coverage / tonnes : null;
    const [topExporters, topImporters] = [
      await topCountries(code, year, "X", worldTradeUsd),
      await topCountries(code, year, "M", worldTradeUsd)
    ];
    const routeRows = await query(
      info.level === "hs2" ? `
      SELECT ce.iso3 AS fi, ce.display_name AS fn,
             ci.iso3 AS ti, ci.display_name AS tn, sum(b.value_usd) AS v
      FROM v_bilateral_hs2 b
      JOIN dim_countries ce ON b.exporter = ce.code
      JOIN dim_countries ci ON b.importer = ci.code
      WHERE b.hs2 = '${code}' AND b.year = ${year} AND NOT b.provisional
      GROUP BY 1, 2, 3, 4 ORDER BY v DESC LIMIT 12` : `
      SELECT ce.iso3 AS fi, ce.display_name AS fn,
             ci.iso3 AS ti, ci.display_name AS tn, sum(f.value_usd) AS v
      FROM ${catalog2.factsExprForYear(year)} f
      JOIN dim_countries ce ON f.exporter = ce.code
      JOIN dim_countries ci ON f.importer = ci.code
      WHERE ${hs6Match(code)}
      GROUP BY 1, 2, 3, 4 ORDER BY v DESC LIMIT 12`
    );
    const summary = {
      info,
      year,
      worldTradeUsd,
      quantityValueCoverage: coverage,
      unitValueUsdPerTonne: unitValue,
      topExporters,
      topImporters,
      topRoutes: routeRows.map((r) => ({
        fromIso3: r.fi,
        fromName: r.fn,
        toIso3: r.ti,
        toName: r.tn,
        valueUsd: num(r.v)
      }))
    };
    return c.json(summary);
  });
  app2.get("/api/product/:code/trend", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!HS_CODE_RE.test(code)) return c.json({ error: "invalid HS code" }, 400);
    const level = levelOf(code);
    const rows = await query(`
      SELECT year, sum(value_usd) AS v, sum(quantity_tonnes) AS q,
             sum(value_usd * coalesce(quantity_value_coverage, 0)) / sum(value_usd) AS cov
      FROM v_product_world
      WHERE ${hs6Match(code)}
      GROUP BY year ORDER BY year
    `);
    if (rows.length === 0) return c.json({ error: "unknown HS code" }, 404);
    const trend = {
      code,
      points: rows.map((r) => {
        const v = num(r.v);
        const q = numOrNull(r.q);
        const cov = numOrNull(r.cov);
        return {
          year: num(r.year),
          valueUsd: v,
          quantityTonnes: level === "hs6" ? q : null,
          unitValueUsdPerTonne: level === "hs6" && q && cov != null && cov >= UNIT_VALUE_MIN_COVERAGE ? v * cov / q : null
        };
      })
    };
    return c.json(trend);
  });
}

// apps/api/src/app.ts
async function partnersFor(codes, year, direction) {
  const [us, them] = direction === "exports" ? ["exporter", "importer"] : ["importer", "exporter"];
  const rows = await query(`
    SELECT c.iso3, c.display_name AS name, sum(b.value_usd) AS v,
           sum(b.value_usd) / sum(sum(b.value_usd)) OVER () AS share
    FROM v_bilateral b
    JOIN dim_countries c ON b.${them} = c.code
    WHERE b.${us} IN ${inCodes(codes)} AND b.year = ${year}
    GROUP BY 1, 2 ORDER BY v DESC LIMIT 12
  `);
  return rows.map((r) => ({
    iso3: r.iso3,
    name: r.name,
    valueUsd: num(r.v),
    share: num(r.share)
  }));
}
function createApp() {
  const app2 = new Hono2();
  app2.use("/api/*", async (c, next) => {
    await next();
    c.header(
      "Cache-Control",
      "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400"
    );
  });
  app2.get("/api/meta", async (c) => {
    const catalog2 = getCatalog();
    const countries = await query(`
      SELECT iso3, display_name AS name FROM dim_countries
      WHERE valid_until IS NULL ORDER BY name
    `);
    const meta = {
      years: catalog2.years,
      defaultYear: catalog2.defaultYear,
      countries,
      datasets: catalog2.datasets
    };
    return c.json(meta);
  });
  app2.get("/api/world", async (c) => {
    const catalog2 = getCatalog();
    const year = Number(c.req.query("year") ?? catalog2.defaultYear);
    const yearInfo = catalog2.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const rows = await query(`
      SELECT c.iso3, any_value(c.display_name) AS name,
             sum(t.exports_usd) AS x, sum(t.imports_usd) AS m,
             min(t.exports_source) AS src
      FROM v_country_totals t
      JOIN dim_countries c ON t.country = c.code
      WHERE t.year = ${year}
      GROUP BY c.iso3
    `);
    const worldRows = await query(`
      SELECT year, sum(exports_usd) AS v FROM v_country_totals
      WHERE year IN (${year}, ${year - 1}) GROUP BY year
    `);
    const worldNow = worldRows.find((r) => num(r.year) === year);
    const worldPrev = worldRows.find((r) => num(r.year) === year - 1);
    const snapshot = {
      year,
      provisional: yearInfo.provisional,
      world: {
        exportsUsd: num(worldNow?.v ?? 0),
        prevYearExportsUsd: numOrNull(worldPrev?.v),
        growth: worldNow && worldPrev ? num(worldNow.v) / num(worldPrev.v) - 1 : null
      },
      countries: rows.map((r) => {
        const x = numOrNull(r.x);
        const m = numOrNull(r.m);
        return {
          iso3: r.iso3,
          name: r.name,
          exportsUsd: x,
          importsUsd: m,
          totalUsd: (x ?? 0) + (m ?? 0),
          balanceUsd: x != null && m != null ? x - m : null,
          exportsSource: r.src ?? null
        };
      })
    };
    return c.json(snapshot);
  });
  app2.get("/api/flows/top", async (c) => {
    const catalog2 = getCatalog();
    const year = Number(c.req.query("year") ?? catalog2.defaultYear);
    const yearInfo = catalog2.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const limit = Math.min(
      Math.max(Number(c.req.query("limit") ?? 30), 1),
      100
    );
    const iso3 = c.req.query("iso3")?.toUpperCase();
    if (iso3 && !/^[A-Z]{3}$/.test(iso3)) {
      return c.json({ error: "invalid iso3" }, 400);
    }
    const rows = await query(`
      SELECT ce.iso3 AS f, ci.iso3 AS t, sum(b.value_usd) AS v
      FROM v_bilateral b
      JOIN dim_countries ce ON b.exporter = ce.code
      JOIN dim_countries ci ON b.importer = ci.code
      WHERE b.year = ${year}
      ${iso3 ? `AND (ce.iso3 = '${iso3}' OR ci.iso3 = '${iso3}')` : ""}
      GROUP BY 1, 2
      ORDER BY v DESC
      LIMIT ${limit}
    `);
    const flows = {
      year,
      provisional: yearInfo.provisional,
      flows: rows.map((r) => ({ from: r.f, to: r.t, valueUsd: num(r.v) }))
    };
    return c.json(flows);
  });
  app2.get("/api/country/:iso3", async (c) => {
    const iso3 = c.req.param("iso3").toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3)) return c.json({ error: "invalid iso3" }, 400);
    const catalog2 = getCatalog();
    const year = Number(c.req.query("year") ?? catalog2.defaultYear);
    const yearInfo = catalog2.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const ref = await resolveCountry(iso3);
    if (!ref) return c.json({ error: "unknown country" }, 404);
    const codes = inCodes(ref.codes);
    const totalsRows = await query(`
      SELECT sum(exports_usd) AS x, sum(imports_usd) AS m,
             min(exports_source) AS src
      FROM v_country_totals
      WHERE country IN ${codes} AND year = ${year}
    `);
    const t = totalsRows[0];
    const exportsUsd = numOrNull(t?.x);
    const importsUsd = numOrNull(t?.m);
    const rankRows = await query(`
      WITH per AS (
        SELECT c.iso3, sum(t.exports_usd) AS x, sum(t.imports_usd) AS m
        FROM v_country_totals t
        JOIN dim_countries c ON t.country = c.code
        WHERE t.year = ${year}
        GROUP BY 1
      )
      SELECT rank() OVER (ORDER BY x DESC NULLS LAST) AS rx,
             rank() OVER (ORDER BY m DESC NULLS LAST) AS rm,
             count(*) OVER () AS n
      FROM per
      QUALIFY iso3 = '${iso3}'
    `);
    const rank = rankRows[0];
    const sectionRows = await query(`
      SELECT f.flow, ch.section, ch.section_name, sum(f.value_usd) AS v
      FROM v_country_flow_hs2 f
      JOIN dim_chapters ch USING (hs2)
      WHERE f.country IN ${codes} AND f.year = ${year}
      GROUP BY 1, 2, 3
      ORDER BY v DESC
    `);
    const sectionsOf = (flow) => {
      const rows = sectionRows.filter((r) => r.flow === flow);
      const total = rows.reduce((s, r) => s + num(r.v), 0);
      return rows.map((r) => ({
        sectionId: r.section,
        name: r.section_name,
        valueUsd: num(r.v),
        share: total > 0 ? num(r.v) / total : 0
      }));
    };
    let metrics = null;
    let dependencies = null;
    if (!yearInfo.provisional) {
      const metricRows = await query(`
        SELECT m.flow, m.partner_hhi, m.top_partner_share, m.partner_count,
               m.product_hhi, c.iso3 AS top_iso3, c.display_name AS top_name
        FROM v_metrics_country m
        JOIN dim_countries c ON m.top_partner = c.code
        WHERE m.country IN ${codes} AND m.year = ${year}
      `);
      const metricOf = (flow) => {
        const r = metricRows.find((m) => m.flow === flow);
        if (!r) return null;
        return {
          partnerHhi: num(r.partner_hhi),
          topPartner: { iso3: r.top_iso3, name: r.top_name, share: num(r.top_partner_share) },
          partnerCount: num(r.partner_count),
          productHhi: num(r.product_hhi)
        };
      };
      const ex = metricOf("X");
      const im = metricOf("M");
      metrics = ex && im ? { exports: ex, imports: im } : null;
      const depRows = await query(`
        SELECT d.hs6, p.name AS product_name, c.iso3 AS supplier_iso3,
               c.display_name AS supplier_name, d.share, d.total_import_usd
        FROM v_import_dependency d
        JOIN dim_products p USING (hs6)
        JOIN dim_countries c ON d.top_supplier = c.code
        WHERE d.importer IN ${codes} AND d.year = ${year}
        ORDER BY d.total_import_usd DESC LIMIT 8
      `);
      dependencies = depRows.map((r) => ({
        hs6: r.hs6,
        productName: r.product_name,
        supplierIso3: r.supplier_iso3,
        supplierName: r.supplier_name,
        share: num(r.share),
        totalImportUsd: num(r.total_import_usd)
      }));
    }
    const summary = {
      iso3,
      name: ref.name,
      year,
      provisional: yearInfo.provisional,
      exportsSource: t?.src ?? (yearInfo.provisional ? null : "reported"),
      totals: {
        exportsUsd,
        importsUsd,
        balanceUsd: exportsUsd != null && importsUsd != null ? exportsUsd - importsUsd : null,
        exportRank: rank ? num(rank.rx) : null,
        importRank: rank ? num(rank.rm) : null,
        rankedCountries: rank ? num(rank.n) : 0
      },
      exportPartners: await partnersFor(ref.codes, year, "exports"),
      importPartners: await partnersFor(ref.codes, year, "imports"),
      exportSections: sectionsOf("X"),
      importSections: sectionsOf("M"),
      metrics,
      dependencies,
      entityNotes: ref.entityNotes
    };
    return c.json(summary);
  });
  app2.get("/api/country/:iso3/trend", async (c) => {
    const iso3 = c.req.param("iso3").toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3)) return c.json({ error: "invalid iso3" }, 400);
    const ref = await resolveCountry(iso3);
    if (!ref) return c.json({ error: "unknown country" }, 404);
    const rows = await query(`
      SELECT year, sum(exports_usd) AS x, sum(imports_usd) AS m,
             bool_or(provisional) AS prov, min(exports_source) AS src
      FROM v_country_totals
      WHERE country IN ${inCodes(ref.codes)}
      GROUP BY 1 ORDER BY 1
    `);
    const trend = {
      iso3,
      name: ref.name,
      points: rows.map((r) => ({
        year: num(r.year),
        exportsUsd: numOrNull(r.x),
        importsUsd: numOrNull(r.m),
        provisional: Boolean(r.prov),
        ...r.src === "mirror" ? { estimated: true } : {}
      })),
      entityNotes: ref.entityNotes
    };
    return c.json(trend);
  });
  registerPairRoutes(app2);
  registerProductRoutes(app2);
  app2.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });
  return app2;
}

// apps/api/src/serverless.ts
var ready = null;
function ensureInit() {
  ready ??= (async () => {
    await initDb();
    await initCatalog();
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
var app = new Hono2();
app.use("*", async (_c, next) => {
  await ensureInit();
  await next();
});
app.route("/", createApp());
export {
  app
};
