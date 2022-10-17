sqlite3 = require "lsqlite3"

function ClientError(msg, loglevel)
    if loglevel ~= nil then
        Log(loglevel, string.format(msg))
    end
    SetStatus(400, msg)
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

function EnforceParams(exact_params)
    local params = GetParams()
    if #params > #exact_params then
        ClientError('too many params')
        return false
    end
    for i,val in ipairs(exact_params) do
        if GetParam(val) == nil then
            ClientError('Missing query param: %s' % {val})
            return false
        end
    end
    return true
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
