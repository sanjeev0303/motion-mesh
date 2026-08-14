//go:build ignore

package main

import (
	"log"
	"os"

	"github.com/nats-io/nats.go"
)

func main() {
	nc, err := nats.Connect(os.Getenv("QUEUE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer nc.Close()

	js, err := nc.JetStream()
	if err != nil {
		log.Fatal(err)
	}

	payload := []byte(`{"video_id":"c4de974c-1a29-4e30-b012-82ceb5f27cc0","source_object_key":"9324317c-ed4d-428d-8a5d-b11dfdedee97/videos/Chaand Baaliyan - Aditya A. (Official Video) [Xi8Fabcb_MA].mp4"}`)
	_, err = js.Publish("transcode.jobs", payload)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Published test job to NATS")
}
