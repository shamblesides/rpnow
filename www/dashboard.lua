if not EnforceMethod({'GET', 'HEAD'}) then return end
if not EnforceParams({}) then return end

SetHeader("Content-Type", "application/json")
Write[==[{"user":{
    "username": "NOBODY",
    "friends": [],
    "rooms": []
}}]==]
