if not EnforceMethod({'POST'}) then return end
if not EnforceParams({}) then return end

local userid = ValidateSession()
if userid == nil then return ClientError(401, "Not logged in") end

local stmt = assert(DB:prepare[[INSERT INTO rooms (title, created_by) VALUES ('Untitled', ?1) RETURNING id]])
if stmt:bind_values(userid) ~= sqlite3.OK then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:bind_values): %s", db:errmsg()))
elseif stmt:step() ~= sqlite3.ROW then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:step): %s %s", DB:errcode(), DB:errmsg()))
end
local roomid = stmt:get_value(0)
stmt:finalize()

local stmt = assert(DB:prepare[[INSERT INTO participating_in (roomid, userid) VALUES (?1, ?2)]])
if stmt:bind_values(roomid, userid) ~= sqlite3.OK then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:bind_values): %s", db:errmsg()))
elseif stmt:step() ~= sqlite3.DONE then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:step): %s %s", DB:errcode(), DB:errmsg()))
end
stmt:finalize()

SetStatus(303)
SetHeader("Location", "/rp.html?room="..roomid)
