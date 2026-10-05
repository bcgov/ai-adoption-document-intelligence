-- Record filters for the Azure Log Analytics mirror (see fluent-bit.yaml).
-- Retains only lines an SRE agent needs to judge app health; Promtail/Loki are unaffected.

local ESC = "\27%[[%d;]*[A-Za-z]"

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

local function decorate(record, tag, line)
  local service = tag:match("^app%.(.+)$") or "unknown"
  record["RawData"] = line
  record["Service"] = service
  record["Project"] = (service == "ches-adapter") and "monitoring" or "host"
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

  record = decorate(record, tag, line)
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
