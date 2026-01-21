# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend2

# Copy package files and install dependencies
COPY frontend2/package.json frontend2/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend2/ .
RUN npm run build

# Stage 2: Build Backend
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS backend-build

WORKDIR /src

# Copy csproj and restore dependencies
COPY isbackbackend/isbackbackend.csproj ./isbackbackend/
RUN dotnet restore isbackbackend/isbackbackend.csproj

# Copy all backend files
COPY isbackbackend/ ./isbackbackend/

# Publish self-contained application
WORKDIR /src/isbackbackend
RUN dotnet publish -c Release -o /app/publish --no-restore

# Stage 3: Runtime Image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS final

WORKDIR /app

# Copy published .NET application
COPY --from=backend-build /app/publish .

# Copy frontend dist files
COPY --from=frontend-build /app/frontend2/dist ./frontend2/dist

# Create database directory
RUN mkdir -p database

# Expose port 80
EXPOSE 80

# Configure ASP.NET Core
ENV ASPNETCORE_URLS=http://+:80
ENV Database__path=database/music_data.db

# Run the application
ENTRYPOINT ["dotnet", "isbackbackend.dll"]
