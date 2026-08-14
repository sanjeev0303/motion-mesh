# Contributing to Motionmesh

We love your input! We want to make contributing to Motionmesh as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features

## Developing Locally

1. Fork the repo and create your branch from `main`.
2. Clone your fork locally.
3. Copy `.env.example` to `.env` and fill in the required environment variables.
4. Run `docker compose up` to start all services (Postgres, Redis, NATS, MinIO, API, Dashboard).
5. If you've added code that should be tested, add tests.
6. If you've changed APIs, update the documentation and OpenAPI specifications.

## Pull Request Process

1. Ensure any install or build dependencies are removed before the end of the layer when doing a build.
2. Update the README.md with details of changes to the interface, this includes new environment variables, exposed ports, useful file locations and container parameters.
3. Ensure your code passes all linting and test suites (`go test ./...`, `npm run lint`, etc.).
4. You may merge the Pull Request in once you have the sign-off of two other developers, or if you do not have permission to do that, you may request the second reviewer to merge it for you.

## Code Style

- **Go**: Follow standard `gofmt` formatting. Use `golangci-lint` to check your code before submitting.
- **TypeScript**: Use `Prettier` for formatting and follow standard ESLint configurations defined in the project.
- **Python**: Follow `PEP 8` guidelines and use `black` for formatting.

## Report bugs using Github's issues

We use GitHub issues to track public bugs. Report a bug by opening a new issue; it's that easy!

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
