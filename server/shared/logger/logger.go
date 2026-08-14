package logger

import (
	"fmt"
	"log/slog"
	"os"
)

type Logger struct {
	logger *slog.Logger
}

func New() *Logger {
	// Use JSON handler for structured logging, better for high throughput and log aggregation
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	return &Logger{
		logger: slog.New(handler),
	}
}

// Info logs an informational message. It accepts printf-style formatting.
func (l *Logger) Info(format string, args ...any) {
	if len(args) > 0 {
		l.logger.Info(fmt.Sprintf(format, args...))
	} else {
		l.logger.Info(format)
	}
}

// Error logs an error message. It accepts printf-style formatting.
func (l *Logger) Error(format string, args ...any) {
	if len(args) > 0 {
		l.logger.Error(fmt.Sprintf(format, args...))
	} else {
		l.logger.Error(format)
	}
}

// Fatal logs an error message and exits the program.
func (l *Logger) Fatal(format string, args ...any) {
	if len(args) > 0 {
		l.logger.Error(fmt.Sprintf(format, args...))
	} else {
		l.logger.Error(format)
	}
	os.Exit(1)
}
