Basic Prototype
---------------

* Download TXT
* Export JSON


Stronger Userbase.com Integration
---------------------------------

* How to store old document revisions
* * Maybe: when you post a message, have a private DB (per RP) that has that revision stashed away
* * Or just: store a _hist prop in each document that matters
* Think about how to fragment the DB to implement permissions
    New RP -> create main DB
    Invite persion -> share the DB in read-only+reshare
    Invitee joins the RP -> they create a DB, share with all participants as read-only+reshare
    All existing participants receive the RP. But how do they know which RP it applies to, securely??
* User settings (change my password, email, etc)
* Manage participants
* Unsolicited invites issue?
* item.createdBy cannot be trusted


Nice to have
------------

* Cache titles changes in cloud
* Browse RP pages without browser navigation
* Webhooks
* Demo RP
* Delete messages
* Typing notifications (separate server on Heroku using Admin API's VerifyAuthToken)
