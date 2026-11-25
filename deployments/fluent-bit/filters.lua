-- Record filters for the Azure Log Analytics mirror (see fluent-bit.yaml).
-- Retains only lines an SRE agent needs to judge app health; Promtail/Loki are unaffected.
-- What identifies a person is removed from a kept line before it is sent: structured lines
-- lose IDENTITY_KEYS, and nginx lines keep only what describes the request.

local ESC = "\27%[[%d;]*[A-Za-z]"

-- Request-context fields the backend merges into every log line (see
-- docs-md/monitoring/LOGGING.md). They name a user, their session, an API key or the
-- caller's address, so they stay in Loki and are removed at any depth before a line is
-- mirrored. requestId is kept: it finds the full line in Loki.
local IDENTITY_KEYS = {
  userId = true,
  actorId = true,
  sessionId = true,
  apiKeyId = true,
  clientIp = true,
}

-- An nginx error-log entry starts with its timestamp and level; access lines start with
-- the client address, so a bracketed word inside a request URL cannot pass for a level.
local NGINX_ERROR_PREFIX = "^%d%d%d%d/%d%d/%d%d %d%d:%d%d:%d%d %[(%a+)%]"

local LEVEL_RANK = {
  debug = 10,
  info = 20,
  warn = 30,
  error = 40,
  fatal = 50,
}

-- Structured lines at or above this rank are always mirrored.
local MIN_RANK = 30

-- Failure signals for lines that carry no level field (NestJS bootstrap, webpack, node crashes).
local FAILURE_PATTERNS = {
  "ERROR",
  "WARN",
  "FATAL",
  "Error:",
  "Exception",
  "UnhandledPromiseRejection",
  "unhandled rejection",
  "ECONNREFUSED",
  "EADDRINUSE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "Cannot find module",
}

-- Vite dev-server chatter with no diagnostic value. Keep these narrow: a loose pattern here
-- silently discards real failures ("ready in " also matches "address already in use").
local FRONTEND_NOISE = {
  "^%s*>%s",
  "VITE v",
  "Local:%s",
  "Network:%s",
  "press h %+ enter",
  "hmr update",
  "page reload",
  "optimized dependencies",
  "new dependencies optimized",
  "Re%-optimizing dependencies",
}

-- Frontend has no level field, so mirroring is allowlist-based.
local FRONTEND_KEEP = {
  "[Ee]rror",
  "ERROR",
  "[Ff]ailed",
  "[Ff]ailure",
  "[Ww]arning",
  "WARN",
  "Exception",
  "ECONNREFUSED",
  "EADDRINUSE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENOENT",
  "Pre%-transform error",
  "Internal server error",
  "is not supported",
  "proxy error",
}

local FRONTEND_ERROR = {
  "[Ee]rror",
  "ERROR",
  "[Ff]ailed",
  "[Ff]ailure",
  "Exception",
  "ECONNREFUSED",
  "EADDRINUSE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENOENT",
}

local function strip(value)
  if type(value) ~= "string" then
    return nil
  end
  local cleaned = value:gsub(ESC, "")
  cleaned = cleaned:gsub("%s+$", "")
  return cleaned
end

local function matches_any(line, patterns)
  for _, pattern in ipairs(patterns) do
    if line:find(pattern) then
      return true
    end
  end
  return false
end

local function skip_ws(s, i)
  return s:find("[^ \t\r\n]", i) or (#s + 1)
end

-- Index just past the JSON string that opens at i, or nil when it never closes.
local function string_end(s, i)
  local j = i + 1
  while true do
    local k = s:find('["\\]', j)
    if k == nil then
      return nil
    end
    if s:sub(k, k) == '"' then
      return k + 1
    end
    j = k + 2
  end
end

-- Rewrites the JSON value at i without IDENTITY_KEYS members, at any depth.
-- Returns the compact text and the index after the value, or nil when it is not JSON.
local function without_identity(s, i)
  i = skip_ws(s, i)
  local c = s:sub(i, i)
  if c == '"' then
    local e = string_end(s, i)
    if e == nil then
      return nil
    end
    return s:sub(i, e - 1), e
  end
  if c == "{" or c == "[" then
    local close = (c == "{") and "}" or "]"
    local parts = {}
    i = skip_ws(s, i + 1)
    if s:sub(i, i) == close then
      return c .. close, i + 1
    end
    while true do
      local key
      if c == "{" then
        if s:sub(i, i) ~= '"' then
          return nil
        end
        local key_end = string_end(s, i)
        if key_end == nil then
          return nil
        end
        key = s:sub(i, key_end - 1)
        i = skip_ws(s, key_end)
        if s:sub(i, i) ~= ":" then
          return nil
        end
        i = i + 1
      end
      local value, e = without_identity(s, i)
      if value == nil then
        return nil
      end
      if key == nil then
        parts[#parts + 1] = value
      elseif not IDENTITY_KEYS[key:sub(2, -2)] then
        parts[#parts + 1] = key .. ":" .. value
      end
      i = skip_ws(s, e)
      local d = s:sub(i, i)
      if d == close then
        return c .. table.concat(parts, ",") .. close, i + 1
      end
      if d ~= "," then
        return nil
      end
      i = skip_ws(s, i + 1)
    end
  end
  -- Number, true, false or null.
  local e = s:find("[,%]}%s]", i) or (#s + 1)
  if e == i then
    return nil
  end
  return s:sub(i, e - 1), e
end

-- A structured line without IDENTITY_KEYS. A line that is not one JSON object (framework
-- text, a truncated object) keeps its text with any of those fields' values replaced.
local function remove_identity(line)
  if line:sub(1, 1) == "{" then
    local rewritten, e = without_identity(line, 1)
    if rewritten ~= nil and skip_ws(line, e) > #line then
      return rewritten
    end
  end
  for key in pairs(IDENTITY_KEYS) do
    line = line:gsub('"' .. key .. '"%s*:%s*"[^"]*"', '"' .. key .. '":"[removed]"')
  end
  return line
end

-- An nginx access line (log_format main in apps/frontend/nginx.conf) reduced to the method,
-- the path without its query string, and the status. The client and forwarded addresses,
-- referer and user agent are dropped.
local function access_summary(line, status)
  local method, target = line:match('"(%u+) (%S+)')
  local path = target and target:match("^[^?#]*") or ""
  if path == "" then
    path = "-"
  end
  return (method or "-") .. " " .. path .. " " .. status
end

-- An nginx error-log entry without the client address and referrer, and without query
-- strings on the request and upstream URLs.
local function error_summary(line)
  line = line:gsub(", client: [^,]*", "")
  line = line:gsub(', referrer: "[^"]*"', "")
  line = line:gsub('(request: "%u+ [^"?%s]*)%?[^"%s]*', "%1")
  line = line:gsub('(upstream: "[^"?]*)%?[^"]*', "%1")
  return line
end

local function decorate(record, tag, line)
  local service = tag:match("^app%.(.+)$") or "unknown"
  record["RawData"] = line
  record["Service"] = service
  local project = os.getenv("LOG_PROJECT")
  record["Project"] = (project ~= nil and project ~= "") and project
    or ((service == "ches-adapter") and "monitoring" or "host")
  record["source_file"] = nil

  local event_time = line:match('"timestamp"%s*:%s*"([^"]+)"')
  if event_time ~= nil then
    record["EventTime"] = event_time
  end

  local alert_type = line:match('"alertType"%s*:%s*"([^"]+)"')
  if alert_type ~= nil then
    record["AlertType"] = alert_type
  end
  return record
end

-- backend-services and temporal-worker: NDJSON interleaved with unstructured framework output.
function structured(tag, timestamp, record)
  local line = strip(record["RawData"])
  if line == nil or line == "" then
    return -1, 0, nil
  end

  local level = line:match('"level"%s*:%s*"(%a+)"')
  local status = tonumber(line:match('"statusCode"%s*:%s*(%d+)'))
  local keep

  if level ~= nil then
    keep = (LEVEL_RANK[level] or 0) >= MIN_RANK or (status ~= nil and status >= 400)
  else
    keep = matches_any(line, FAILURE_PATTERNS)
  end

  if not keep then
    return -1, 0, nil
  end

  record = decorate(record, tag, remove_identity(line))
  record["Level"] = level or "unknown"
  if status ~= nil then
    record["StatusCode"] = status
  end
  return 1, timestamp, record
end

-- frontend: raw Vite stdout, no level field.
function frontend(tag, timestamp, record)
  local line = strip(record["RawData"])
  if line == nil or line == "" then
    return -1, 0, nil
  end
  -- Keep-patterns are evaluated first so a noise pattern can never mask a real failure.
  if not matches_any(line, FRONTEND_KEEP) then
    return -1, 0, nil
  end
  if matches_any(line, FRONTEND_NOISE) then
    return -1, 0, nil
  end

  record = decorate(record, tag, line)
  record["Level"] = matches_any(line, FRONTEND_ERROR) and "error" or "warn"
  return 1, timestamp, record
end

-- nginx access/error logs in OpenShift, rather than the local Vite dev server.
function nginx(tag, timestamp, record)
  local line = strip(record["RawData"])
  if line == nil or line == "" then
    return -1, 0, nil
  end

  local error_level = line:match(NGINX_ERROR_PREFIX)
  if error_level ~= nil then
    if error_level == "warn" or error_level == "error" or error_level == "crit"
      or error_level == "alert" or error_level == "emerg" then
      record = decorate(record, tag, error_summary(line))
      record["Level"] = error_level == "warn" and "warn" or "error"
      return 1, timestamp, record
    end
    return -1, 0, nil
  end

  local status = tonumber(line:match('"%s+(%d%d%d)%s+'))
  if status ~= nil and status >= 400 then
    record = decorate(record, tag, access_summary(line, status))
    record["StatusCode"] = status
    record["Level"] = status >= 500 and "error" or "warn"
    return 1, timestamp, record
  end
  return -1, 0, nil
end

-- ches-adapter: low volume and directly on the alert-delivery path, so mirror everything.
function passthrough(tag, timestamp, record)
  local line = strip(record["RawData"])
  if line == nil or line == "" then
    return -1, 0, nil
  end

  record = decorate(record, tag, line)
  record["Level"] = line:match('"level"%s*:%s*"(%a+)"') or "info"
  return 1, timestamp, record
end
