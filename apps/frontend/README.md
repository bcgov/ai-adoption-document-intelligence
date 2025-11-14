# AI OCR Frontend

A modern React application built with Vite, TypeScript, and a clean layered architecture.

## Project Structure

This project follows a layered architecture with clear separation of concerns:

```
src/
├── components/          # UI Layer - React components
├── data/                # Data Layer - API services and hooks
│   ├── services/        # API service classes
│   └── hooks/           # Custom React hooks for data fetching
├── shared/              # Shared Layer - Common utilities and types
│   ├── types/           # TypeScript type definitions
│   ├── constants/       # Application constants
│   ├── utils/           # Utility functions
│   └── styles/          # Global styles
├── App.tsx              # Main App component
└── main.tsx             # Application entry point
```

## Features

- ⚡ **Vite** - Lightning-fast development with hot module replacement
- ⚛️ **React 18** - Modern React with concurrent features
- 🔷 **TypeScript** - Full type safety and better developer experience
- 🎨 **Clean Architecture** - Organized code with clear separation of concerns
- 🔧 **ESLint** - Code linting and formatting

## Getting Started

### Prerequisites

- Node.js 22+
- npm 9+

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Build

```bash
# Build for production
npm run build
```

### Preview

```bash
# Preview production build
npm run preview
```

### Linting

```bash
# Run ESLint
npm run lint
```

## Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:4000/api

# Application Configuration
VITE_APP_NAME=AI OCR Frontend
VITE_APP_VERSION=1.0.0
```

## Architecture Guidelines

### Data Layer
- Contains API services and data fetching logic
- Custom hooks for reusable data operations
- Centralized error handling and loading states

### UI Layer
- Pure React components focused on presentation
- Reusable component library
- Component composition over inheritance

### Shared Layer
- Common utilities and helper functions
- TypeScript type definitions
- Application constants and configuration
- Global styles and CSS variables

## Contributing

1. Follow the established project structure
2. Use TypeScript for all new code
3. Write clear, concise component and function names
4. Add proper TypeScript types
5. Run linting before committing
