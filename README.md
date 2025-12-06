# Dyad Next.js Docker Template

This template provides a robust boilerplate for building and deploying Next.js applications fully containerized with Docker, leveraging GitHub Container Registry (GHCR) for image hosting, and using a **pure JavaScript JSON database (`lowdb`)** as the backend. It also includes configuration for Next.js API proxying to handle external API integrations and CORS issues seamlessly.

## ✨ Features

- **Next.js**: A powerful React framework for building full-stack web applications.
  
- **Docker & Docker Compose**: Containerize your application for consistent environments across development, testing, and production. Run your entire stack locally with a single command.
  
- **GitHub Container Registry (GHCR)**: Automate your Docker image builds and push them to GHCR using GitHub Actions, providing a secure and integrated package registry.
  
- **JSON Database (`lowdb`)**: A lightweight, file-based JSON database that runs entirely in JavaScript. This simplifies database setup by eliminating native dependency issues and manual migration commands.
  
- **Next.js API Proxying (Rewrites)**: Built-in configuration to proxy requests to external APIs from your Next.js backend, helping to bypass client-side CORS restrictions.
  
- **Dyad-ready**: Optimized for deployment on the Dyad platform, leveraging your GHCR-hosted Docker image.
  

## 🚀 Getting Started

To use this template, follow these steps:

### Prerequisites

Before you begin, ensure you have the following installed:

- **Git**: For version control.
  
- **Node.js**: (v18 or higher recommended) and npm or Yarn.
  
- **Docker & Docker Compose**: For building and running containers.
  
- **GitHub Account**: For using GHCR and GitHub Actions.
  

### 1. Create Your Project from This Template

1. **Use This Template**: On GitHub, navigate to the template repository and click the green "Use this template" button (or "Use this template" -> "Create a new repository").
  
2. **Clone Your New Repository**:
  
  ```
  git clone https://github.com/your-username/your-new-repo-name.gitcd your-new-repo-name
  ```
  

### 2. Environment Setup

Copy the example environment variables file:

```
cp .env.example .env
```

Now, open the newly created `.env` file and configure your settings:

- `DATABASE_DIR`: Optional. If set, this defines the directory where your `db.json` file will be stored (default is `./data`).
  
- `EXTERNAL_API_URL_SERVICE1`, `EXTERNAL_API_URL_SERVICE2`, `WEATHER_API_URL`: These environment variables are used for generic external API proxying. **Set these to the actual base URLs of the external APIs you intend to proxy.** If a variable is left blank or omitted, the corresponding proxy rule will not be active.
  
  - **Note to AI/Users**: For any *new* external APIs you wish to integrate beyond these examples, you will need to **add a new environment variable** (e.g., `MY_NEW_API_URL`) to your `.env` file and configure a corresponding rewrite rule in `next.config.ts`.

## 💾 Database Setup (JSON Database with `lowdb`)

This template uses a **JSON file (`db.json`)** for its database, managed by the **`lowdb`** library. The `db.json` file and its initial structure are automatically created with default empty data (`{ examples: [] }`) when the application first starts.

1. **Install Dependencies**:
  
  ```
  npm install # or yarn install
  ```
  
2. **Schema Definition & Persistence**:
  The database structure (e.g., the `examples` array) is defined and initialized within `src/lib/database.ts`. All changes to the database (adding, updating, deleting data) are automatically persisted to the `db.json` file by `lowdb`'s adapter whenever you call `db.write()` after modifying `db.data`.
  
  - **Note to AI/Users**: If you need to store new types of data, you should **update the `DbSchema` interface** in `src/lib/database.ts` and ensure the default data in the `Low` constructor is initialized with empty arrays/objects for new collections.

## 🐳 Local Development with Docker Compose

This template includes a `docker-compose.yml` file to quickly spin up your application in a Dockerized environment locally.

1. **Build Your Docker Image Locally (Optional but good for testing)**:
  While GitHub Actions will build your image for GHCR, you can build it locally to ensure your `Dockerfile` works as expected:
  
  ```
  docker build -t your-app-name:local .
  ```
  
2. **Run with Docker Compose**:
  Navigate to the root of your project and run:
  
  ```
  docker compose up -d
  ```
  
  This command:
  
  - Builds your Docker image if it hasn't been built or updated.
    
  - Starts your Next.js application in a Docker container.
    
  - Maps port `3000` from the container to `3000` on your host machine. You can change `3000:3000` in `docker-compose.yml` to, for example, `8080:3000` to access it on port 8080.
    
  - Creates a Docker volume (`dyad_db_data`) to persist your JSON database file (`db.json`), ensuring your data isn't lost when the container is stopped or removed.
    
3. **Access Your Application**:
  Once the containers are running, open your web browser and navigate to: `http://localhost:3000`
  
4. **Test API Endpoints**:
  The template includes a sample API endpoint at `/api/examples` that interacts with the JSON database. You can send GET and POST requests to this endpoint to test database functionality. If you've configured `EXTERNAL_API_URL_SERVICE1`, you can also try to test proxied endpoints like `/api/service1/posts` (assuming the service you configured has those endpoints).
  
5. **Stop the Application**:
  To stop and remove the containers and the associated volume (if you want to reset the database), run:
  
  ```
  docker compose down -v
  ```
  
  To stop only the containers without removing the volume, use `docker compose down`.
  

## ☁️ GitHub Container Registry (GHCR) Integration

This template is configured to automatically build and push your Docker image to GHCR.

- **Workflow**: The `.github/workflows/main.yml` file defines a GitHub Actions workflow that triggers on:
  
  - Pushes to the `main` branch.
    
  - Creation of new tags (e.g., `v1.0.0`).
    
- **Image Location**: Your Docker image will be pushed to `ghcr.io/your-github-username/your-repo-name:latest` (or `ghcr.io/your-github-username/your-repo-name:v1.0.0` for tags). You can find your images under the "Packages" section of your GitHub repository.
  
- **Authentication**: The workflow uses the `GITHUB_TOKEN` to authenticate and push images securely to GHCR.
  

## ↔️ Next.js API Proxying (Rewrites)

The `next.config.ts` file is configured to allow proxying requests from your Next.js application to external APIs. This is particularly useful for bypassing Cross-Origin Resource Sharing (CORS) issues when making API calls from the browser.

- **Conditional Configuration**: The `async rewrites()` function in `next.config.ts` will **only create a proxy rule if the corresponding environment variable (e.g., `EXTERNAL_API_URL_SERVICE1`) is explicitly set and not blank.** This means your application will start without errors even if you don't need all proxy rules immediately.
  
- **Usage Example**: If you set `EXTERNAL_API_URL_SERVICE1=https://api.example.com`, a request from your frontend to `/api/service1/data` will be proxied by your Next.js backend to `https://api.example.com/data`. If `EXTERNAL_API_URL_SERVICE1` is blank, that rule will simply not be active.
  
- **Customization**: To integrate your specific external APIs, **set the corresponding environment variables in your `.env` file**. You can also add more rewrite rules to `next.config.ts` for additional APIs.
  
  - **Note to AI/Users**: When integrating with a *new* external API, the AI should **add a new rewrite rule** to `next.config.ts` for that specific API and guide the user to set the corresponding environment variable.

## 🚀 Deployment to Dyad

This template is designed for easy deployment to Dyad. The `dyad.yaml` file specifies how Dyad should deploy your application.

- **Image Source**: `dyad.yaml` points to your Docker image on GHCR (e.g., `image: ghcr.io/your-github-username/your-repo-name:latest`).
  
- **Ports**: It exposes port `3000`, matching your Next.js application's internal port.
  
- **Dyad CLI**: Refer to the official Dyad documentation on how to use their CLI to deploy your application using this template and your GHCR image.
  

## 🛠️ Customization

Feel free to customize this template to fit your specific needs:

- **Database Schema**: Modify `src/lib/database.ts` and the `DbSchema` interface to define the structure of your JSON data. Remember to call `db.write()` after any data modifications.
  
- **Next.js API Routes**: Extend the `pages/api/examples.ts` or create new API routes to interact with your `lowdb` database and external services.
  
- **Frontend**: Build out your Next.js UI components.
  
- **Docker Configuration**: Adjust the `Dockerfile` for specific dependencies or optimizations.
  
- **Docker Compose**: Add more services or configure volumes/networks as needed in `docker-compose.yml`.
  
- **GitHub Actions**: Customize the CI/CD workflow (`.github/workflows/main.yml`) for different branching strategies or testing.
  

## ❓ Questions or Issues

If you have questions or encounter issues, please refer to the documentation for Next.js, Docker, `lowdb`, GitHub Actions, and Dyad. If you believe there's an issue with the template itself, consider opening an issue in the template repository.
