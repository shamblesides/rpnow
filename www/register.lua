if not EnforceMethod({'POST'}) then return end
if not EnforceParams({'username', 'password'}, {'email', 'rememberMe'}) then return end

local username = GetParam('username')
local passhash = argon2.hash_encoded(GetParam('password'), GetRandomBytes(16))
local email = GetParam('email')
-- TODO: validate username, len(passhash)><, email?
-- TODO handle rememberMe

local stmt = assert(DB:prepare[[INSERT INTO users (username, passhash, email) VALUES (?1, ?2, ?3) RETURNING id]])
if stmt:bind_values(username, passhash, email) ~= sqlite3.OK then
    error("register.lua bind_values")
end
if stmt:step() ~= sqlite3.ROW then
    stmt:finalize()
    if DB:errcode() == sqlite3.CONSTRAINT then
        return ClientError(400, "Username already exists")
    else
        return InternalError(string.format("Internal error (stmt:step): %s %s", DB:errcode(), DB:errmsg()))
    end
end
local userid = stmt:get_value(0)
if stmt:step() ~= sqlite3.DONE then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:step 2): %s %s", DB:errcode(), DB:errmsg()))
end
stmt:finalize()

local stmt = assert(DB:prepare[[INSERT INTO sessions (id, userid, keyhash, expires) VALUES (?1, ?2, ?3, ?4)]])
local sessionid = EncodeBase64(GetRandomBytes(32/4*3))
local sessionkey = EncodeBase64(GetRandomBytes(64/4*3))
local keyhash = EncodeBase64(Sha256(sessionkey))
local expires = os.time() + (60 * 60 * 24 * 7)
if stmt:bind_values(sessionid, userid, keyhash, expires) ~= sqlite3.OK then
    error("register.lua bind_values")
elseif stmt:step() ~= sqlite3.DONE then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:step): %s %s", DB:errcode(), DB:errmsg()))
end
stmt:finalize()

local token = sessionid..":"..sessionkey
SetCookie("session", token, {Expires=expires, HttpOnly=true, SameSite="strict"})

Write("<!doctype html><p>Welcome!</p><a href=/>Go to dashboard</a>")
