# Central Cafetaria - Server

## Project Title
* **Project Name:** Central Cafetaria Server
* **Description:** A Node.js/Express backend providing the core business logic and data management for the Central Cafetaria system.
* **Purpose:** To manage the database, handle authentication, process real-time orders, and provide financial/inventory analytics.

## Features
* **User Management:** Secure registration with password hashing and verification workflows.
* **Queue Engine:** Intelligent order queueing with automatic position and wait-time calculation.
* **Financial System:** Coin-based payment gateway with refund logic and global value adjustment.
* **Real-time Engine:** Server-Sent Events (SSE) for broadcasting live queue updates to all connected clients.
* **Reporting:** Aggregated sales analytics (Revenue, Order volume, Item popularity) with export support.
* **Inventory Management:** CRUD operations for food items and raw materials with stock monitoring.

## Tech Stack
### Backend
* **Framework:** Express 5.1
* **Authentication:** BcryptJS (Password hashing)
* **Real-time:** Native Server-Sent Events (SSE)
* **Middleware:** CORS, JSON parser

## Database
* **Technology:** MongoDB
* **ORM/ODM:** Direct MongoDB Node.js Driver (Native)

## System Architecture
A monolithic Express server acting as a RESTful API. It implements a serverless-friendly MongoDB connection pool and manages real-time state via an in-memory client registry for SSE.

## Project Structure
* `index.js`: The monolithic entry point containing all routes, controllers, and database logic.
* `vercel.json`: Deployment configuration for Vercel environments.
* `.env`: Environment configuration file.

## Authentication Flow
* **Registration:** Hashes passwords using BcryptJS (10 salt rounds) and stores user documents in the `Users` collection with a `verified: false` status.
* **Login:** Verifies credentials or QR code strings.
* **Session Management:** Stateless response model. Note: API endpoints are currently open and rely on frontend route protection.

## API Overview
* **User/Admin:** `POST /register`, `POST /login`, `POST /adminlogin`, `GET /users`.
* **Ordering:** `POST /order/queue`, `PATCH /order/:id/status`, `PATCH /order/:id/received`.
* **Queue:** `GET /queue/stream` (SSE), `GET /latqueue`, `GET /queue/completed`.
* **Finance:** `GET /coin-value`, `POST /coin-value`, `POST /users/:id/coin-request`, `PATCH /users/:userId/refund-coins`.
* **Reporting:** `GET /api/sales/months`, `GET /api/sales/range`, `GET /api/sales/overall-analytics`.

## Database Overview
### Collections
* **Users:** Credentials, `cart`, `coins`, and `coinIncreaseRequests` (embedded).
* **FoodItems:** Menu items, prices, and `availability` (per category).
* **QueueOrders:** Live orders currently being processed.
* **Events:** Hall booking and event records.
* **RawMaterials:** Stock levels for cafeteria inventory.
* **Settings:** System-wide configurations (e.g., `coinSettings`).

### Relationships
* **User -> Orders:** One-to-Many relationship linked by `userId`.
* **User -> CoinRequests:** One-to-Many relationship (embedded objects).

## Installation
```bash
git clone <repository-url>
cd CentralCafetariaServer
npm install
```

## Environment Variables
| Name | Purpose | Required |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB Connection String | Yes |
| `PORT` | Server Listening Port (Default: 5000) | No |

## Running the Project
* **Development:** `node index.js`
* **Production:** `node index.js` (or via `vercel dev` for local testing)

## Known Limitations
* **Monolith:** The entire backend is contained in `index.js`, making modular testing difficult.
* **Security Gap:** No server-side middleware to verify requests; API endpoints are public.
* **SSE Scaling:** In-memory client tracking prevents horizontal scaling without a shared Pub/Sub.

## Future Improvements
* Refactoring into a Layered Architecture (Routes -> Controllers -> Services).
* Implementation of JWT-based Authentication Middleware.
* Integration of Mongoose for better schema validation.
* Transition to Redis for distributed real-time update handling.

## License
* ISC (Refer to `package.json`)
