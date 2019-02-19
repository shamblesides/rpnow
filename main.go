package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	gonanoid "github.com/matoous/go-nanoid"
	"github.com/rpnow/rpnow/db"
	"github.com/rs/xid"
)

var port = 13000
var addr = fmt.Sprintf(":%d", port)

func main() {
	// Print "Goodbye" after all defer statements are done
	defer log.Println("Goodbye!")

	// db
	if err := db.Open("./data/rpnow.boltdb"); err != nil {
		log.Fatal(err)
	}
	defer func() {
		err := db.Close()
		if err != nil {
			log.Fatal(err)
		}
		log.Println("Database stopped")
	}()

	// create router
	router := mux.NewRouter().StrictSlash(true)

	// api
	api := router.PathPrefix("/api").Subrouter()
	api.HandleFunc("/health", health).Methods("GET")
	api.HandleFunc("/rp", createRp).Methods("POST")
	api.HandleFunc("/rp/import", todo).Methods("POST")
	api.HandleFunc("/rp/import/{slug:[-0-9a-zA-Z]+}", todo).Methods("POST")
	api.HandleFunc("/user", createUser).Methods("POST")
	api.HandleFunc("/user/verify", verifyUser).Methods("GET")
	roomAPI := api.PathPrefix("/rp/{slug:[-0-9a-zA-Z]+}").Subrouter()
	roomAPI.HandleFunc("/", rpChat).Methods("GET")
	roomAPI.HandleFunc("/updates", rpChatUpdates).Methods("GET").Queries("since", "{since:[1-9][0-9]*}")
	roomAPI.HandleFunc("/pages", todo).Methods("GET")
	roomAPI.HandleFunc("/pages/{pageNum:[1-9][0-9]*}", todo).Methods("GET")
	roomAPI.HandleFunc("/download.txt", todo).Methods("GET")
	roomAPI.HandleFunc("/export", todo).Methods("GET")
	roomAPI.HandleFunc("/{collectionName:[a-z]+}", rpSendThing).Methods("POST")
	roomAPI.HandleFunc("/{collectionName:[a-z]+}/{docId:[0-9a-z]+}", todo).Methods("PUT")
	roomAPI.HandleFunc("/{collectionName:[a-z]+}/history", todo).Methods("GET")
	api.PathPrefix("/").HandlerFunc(apiMalformed)

	// routes
	router.HandleFunc("/", indexHTML).Methods("GET")
	router.HandleFunc("/terms", indexHTML).Methods("GET")
	router.HandleFunc("/format", indexHTML).Methods("GET")
	router.HandleFunc("/rp/{rpCode}", indexHTML).Methods("GET")
	router.HandleFunc("/read/{rpCode}", indexHTML).Methods("GET")
	router.HandleFunc("/read/{rpCode}/page/{page}", indexHTML).Methods("GET")

	// assets
	router.PathPrefix("/").Handler(http.FileServer(http.Dir("views/dist")))

	// listen
	srv := &http.Server{
		Addr: addr,
		// Good practice to set timeouts to avoid Slowloris attacks.
		WriteTimeout: time.Second * 15,
		ReadTimeout:  time.Second * 15,
		IdleTimeout:  time.Second * 60,
		Handler:      router, // Pass our instance of gorilla/mux in.
	}
	go func() {
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("listen and serve: %s", err)
		}
	}()
	// defer gracefully closing the server
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Fatalf("http shutdown: %s", err)
		}
		log.Println("Http server stopped")
	}()

	// server is ready
	log.Printf("Listening on %s\n", addr)

	// await kill signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	<-c
}

func health(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, `{"rpnow":"ok"}`)
}

func createRp(w http.ResponseWriter, r *http.Request) {
	// parse rp header fields
	var header RpHeader
	err := json.NewDecoder(r.Body).Decode(&header)
	if err != nil {
		panic(err)
	}
	log.Println(header)
	// generate slug
	slug, err := gonanoid.Generate("abcdefhjknpstxyz23456789", 20)
	if err != nil {
		panic(err)
	}
	// generate rpid
	var slugInfo SlugInfo
	slugInfo.Rpid = "rp_" + xid.New().String()

	// add to db
	db.Add(&db.Doc{Namespace: slugInfo.Rpid, Collection: "head", ID: "0", Value: &header})
	db.Add(&db.Doc{Namespace: "system", Collection: "slugs", ID: slug, Value: &slugInfo})
	// tell user the created response slug
	json.NewEncoder(w).Encode(map[string]string{"rpCode": slug})
}

func rpChat(w http.ResponseWriter, r *http.Request) {
	// data to be sent
	var data RpChatState

	// parse slug
	params := mux.Vars(r)
	// get rpid from slug
	var slugInfo SlugInfo
	err := db.One(&db.Doc{Namespace: "system", Collection: "slugs", ID: params["slug"], Value: &slugInfo})
	if err != nil {
		panic(err)
	}
	// get rp data
	err = db.One(&db.Doc{Namespace: slugInfo.Rpid, Collection: "head", ID: "0", Value: &data.RpHeader})
	if err != nil {
		panic(err)
	}
	data.Msgs = []RpMessage{}
	data.Charas = []RpChara{}
	data.LastSeq = 2
	data.ReadCode = "abc-read"

	// send data
	json.NewEncoder(w).Encode(data)
}

func rpChatUpdates(w http.ResponseWriter, r *http.Request) {
	var data RpChatUpdates

	params := mux.Vars(r)
	since, err := strconv.Atoi(params["since"])
	if err != nil {
		panic(err)
	}

	data.LastSeq = since
	data.Updates = []interface{}{}

	json.NewEncoder(w).Encode(data)
}

func rpSendThing(w http.ResponseWriter, r *http.Request) {
	var doc db.Doc

	// generate key for new object
	doc.ID = xid.New().String()

	params := mux.Vars(r)
	doc.Collection = params["collectionName"]

	var slugInfo SlugInfo
	err := db.One(&db.Doc{Namespace: "system", Collection: "slugs", ID: params["slug"], Value: &slugInfo})
	if err != nil {
		panic(err)
	}
	doc.Namespace = slugInfo.Rpid

	// validate value
	if doc.Collection == "msgs" {
		var body RpMessageBody
		err := json.NewDecoder(r.Body).Decode(&body)
		if err != nil {
			panic(err)
		}
		doc.Value = body
	} else if doc.Collection == "charas" {
		var body RpCharaBody
		err := json.NewDecoder(r.Body).Decode(&body)
		if err != nil {
			panic(err)
		}
		doc.Value = body
	} else {
		panic(fmt.Errorf("Invalid collection: %s", doc.Collection))
	}

	// More
	ipStr, _, _ := net.SplitHostPort(r.RemoteAddr)
	doc.IP = net.ParseIP(ipStr)
	doc.Timestamp = time.Now()
	doc.Userid = "nobody09c39024f1ef"

	// put it in the db
	db.Add(&doc)

	// bounce it back and send
	w.Write(doc.PublicValue())
}

func createUser(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, `{"userid":"nobody09c39024f1ef","token":"x"}`)
}

func verifyUser(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func indexHTML(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "views/dist/index.html")
}

func apiMalformed(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusBadRequest)
	fmt.Fprintln(w, "{\"error\":\"Malformed request\"}")
}

func todo(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
	fmt.Fprintln(w, "TODO")
}
