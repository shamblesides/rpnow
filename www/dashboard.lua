if not EnforceMethod({'GET', 'HEAD'}) then return end
if not EnforceParams({}) then return end

local userid = ValidateSession()
if userid == nil then return ClientError(401, "Not logged in") end

local out = {username = "NOBODY", friends = {[0]=false}, rooms = {[0]=false}}

local stmt = assert(DB:prepare[[
    SELECT rooms.id, rooms.title
    FROM participating_in JOIN rooms ON participating_in.roomid = rooms.id
    WHERE participating_in.userid = ?1
]])

if stmt:bind_values(USERID) ~= sqlite3.OK then
    stmt:finalize()
    return InternalError(string.format("Internal error (stmt:bind_values): %s", db:errmsg()))
end

for row in stmt:nrows() do
    table.insert(out.rooms, row)
end
stmt:finalize()

SetHeader("Content-Type", "application/json")
EncodeJson(out, {useoutput=true})

