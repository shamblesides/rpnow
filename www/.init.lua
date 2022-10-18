sqlite3 = require "lsqlite3"

function ClientError(code, msg, loglevel)
    if loglevel ~= nil then
        Log(loglevel, string.format(msg))
    end
    SetStatus(code, msg)
    SetHeader('Content-Type', 'text/plain')
    Write(msg..'\r\n')
    return msg
end

function InternalError(msg)
    Log(kLogWarn, msg)
    SetHeader('Connection', 'close')
    return ServeError(500)
end

function EnforceMethod(allowed_methods)
    local method = GetMethod()
    for i,val in ipairs(allowed_methods) do
        if method == val then
            return true
        end
    end
    Log(kLogWarn, "got %s request from %s" % {method, FormatIp(GetRemoteAddr() or "0.0.0.0")})
    ServeError(405)
    SetHeader("Cache-Control", "private")
    SetHeader('Allow', table.concat(allowed_methods, ', '))
    return false
end

function EnforceParams(required_params, optional_params)
    optional_params = optional_params or {}
    local params = GetParams()
    if #params > #required_params + #optional_params then
        ClientError(400, 'too many params')
        return false
    end

    for i,val in ipairs(required_params) do
        if GetParam(val) == nil then
            ClientError(400, 'Missing query param: %s' % {val})
            return false
        end
    end

    local remaining_params = #params - #required_params
    for i,val in ipairs(optional_params) do
        if HasParam(val) then
            remaining_params = remaining_params - 1
        end
    end
    if remaining_params ~= 0 then
        ClientError(400, 'unknown param')
        return false
    end

    return true
end

function ValidateSession()
    local sess = GetCookie("session")
    if sess == nil then return nil end
    if #sess > 32 + 1 + 64 then return nil end
    local i0, i1, chunk1, chunk2 = string.find(sess, "^([%w/+]+):([%w/+]+)$")
    if i0 == nil then return nil end
    local stmt = assert(DB:prepare[[SELECT userid, keyhash, expires FROM sessions WHERE id = ?1]])
    if stmt:bind_values(chunk1) ~= sqlite3.OK then
        error("ValidateSession bind_values")
    end
    local res = stmt:step()
    if res == sqlite3.DONE then
        stmt:finalize()
        return nil
    elseif res ~= sqlite3.ROW then
        stmt:finalize()
        return InternalError(string.format("Internal error (stmt:step): %s", DB:errmsg()))
    end
    local userid = stmt:get_value(0)
    local keyhash = DecodeBase64(stmt:get_value(1))
    local expires = stmt:get_value(2)
    stmt:finalize()
    if os.time() > expires then
        return nil
    end
    local hashdiff = 0
    local myhash = Sha256(chunk2)
    for i = 1, #keyhash do
        hashdiff = hashdiff | (string.byte(keyhash, i) ~ string.byte(myhash, i))
    end
    if hashdiff ~= 0 then
        return nil
    end
    return userid
end

function OnWorkerStart()
    assert(unix.setrlimit(unix.RLIMIT_RSS, 100 * 1024 * 1024))
    assert(unix.setrlimit(unix.RLIMIT_CPU, 4))
    assert(unix.unveil("/var/tmp", "rwc"))
    assert(unix.unveil("/tmp", "rwc"))
    assert(unix.unveil(nil, nil))
    assert(unix.pledge("stdio flock rpath wpath cpath", nil, unix.PLEDGE_PENALTY_RETURN_EPERM))

    DB = sqlite3.open("db.sqlite3")
    DB:busy_timeout(1000)
    DB:exec[[PRAGMA journal_mode=WAL]]
    DB:exec[[PRAGMA synchronous=NORMAL]]
    DB:exec[[SELECT ip FROM land WHERE ip = 0x7f000001]] -- We have to do this warmup query for SQLite to work after doing unveil
end
