SetCookie("session", "", {Expires=0, HttpOnly=true, SameSite="strict"})
-- SetStatus(303)
-- SetHeader("Location", "/")
Write("<!doctype html><p>Goodbye</p><a href=/>Seeya!</a>")