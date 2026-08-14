package queue

import (
	"fmt"

	"github.com/nats-io/nats.go"
)

type Queue struct {
	Conn *nats.Conn
	JS   nats.JetStreamContext
}

func Connect(url string) (*Queue, error) {
	nc, err := nats.Connect(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("failed to create JetStream context: %w", err)
	}

	return &Queue{Conn: nc, JS: js}, nil
}

func (q *Queue) Close() {
	if q.Conn != nil {
		q.Conn.Close()
	}
}
