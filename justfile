# Snowflake MCP Server — Keycard-protected, Streamable HTTP

set dotenv-load

# Show available recipes
default:
  @just --list

# Install dependencies
install:
  npm install

# Run the server in development mode (hot reload)
dev:
  npm run dev

# Build TypeScript to dist/
build:
  npm run build

# Start the production server (requires build first)
start: build
  npm start

# Run all tests
test:
  npm test

# Run tests in watch mode
test-watch:
  npm run test:watch

# Type-check without emitting
lint:
  npm run lint

# Run tests + type-check (CI-style)
check: lint test
