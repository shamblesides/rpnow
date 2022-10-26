if not EnforceMethod({'GET', 'HEAD'}) then return end
if not EnforceParams({'id'}, {'page', 'messages_since', 'charas_since'}) then return end

local userid = ValidateSession()
if userid == nil then return ClientError(401, "Not logged in") end

local out = {username = "NOBODY", friends = {[0]=false}, rooms = {[0]=false}}

local roomid = GetParam('id')
local stmt = assert(DB:prepare[[
    SELECT rooms.title
    FROM participating_in JOIN rooms ON participating_in.roomid = rooms.id
    WHERE participating_in.userid = ?1
    AND participating_in.roomid = ?2
]])

if stmt:bind_values(userid, roomid) ~= sqlite3.OK then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:bind_values): %s", db:errmsg()))
end

local res = stmt:step()
if res == sqlite3.DONE then
    stmt:finalize()
    return ClientError(404, "Room not found")
elseif res ~= sqlite3.ROW then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:step): %s", DB:errmsg()))
end
local title = stmt:get_value(0)
stmt:finalize()

local out = {title=title, messages={[0]=false}, charas={[0]=false}}

SetHeader("Content-Type", "application/json")
EncodeJson(out, {useoutput=true})
