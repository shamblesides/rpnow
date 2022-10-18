if not EnforceMethod({'POST'}) then return end
if not EnforceParams({'username', 'password'}, {'rememberMe'}) then return end

local username = GetParam('username')
local trypass = GetParam('password')
-- TODO handle rememberMe

local stmt = assert(DB:prepare[[SELECT id, passhash FROM users WHERE username = ?1]])
if stmt:bind_values(username) ~= sqlite3.OK then
    error("login.lua bind_values")
end
local res = stmt:step()
if res == sqlite3.DONE then
    stmt:finalize()
    return ClientError(400, "Invalid credentials")
elseif res ~= sqlite3.ROW then
    stmt:finalize()
    return InternalError(string.format("Internal error (login.lua: get pass hash): %s %s", DB:errcode(), DB:errmsg()))
end
local userid = stmt:get_value(0)
local passhash = stmt:get_value(1)
stmt:finalize()

if not argon2.verify(passhash, trypass) then
    return ClientError(400, "Invalid credentials")
end

local stmt = assert(DB:prepare[[INSERT INTO sessions (id, userid, keyhash, expires) VALUES (?1, ?2, ?3, ?4)]])
local sessionid = EncodeBase64(GetRandomBytes(32/4*3))
local sessionkey = EncodeBase64(GetRandomBytes(64/4*3))
local keyhash = EncodeBase64(Sha256(sessionkey))
local expires = os.time() + (60 * 60 * 24 * 7)
if stmt:bind_values(sessionid, userid, keyhash, expires) ~= sqlite3.OK then
    error("register.lua bind_values")
elseif stmt:step() ~= sqlite3.DONE then
    stmt:finalize()
    return InternalError(string.format("Internal error (login.lua: insert session): %s %s", DB:errcode(), DB:errmsg()))
end
stmt:finalize()

local token = sessionid..":"..sessionkey
SetCookie("session", token, {Expires=expires, HttpOnly=true, SameSite="strict"})

Write("<!doctype html><p>Welcome back!</p><a href=/>Go to dashboard</a>")
