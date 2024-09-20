# Stage 1: Build the Angular application
FROM node:18 AS build

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build --prod

# Stage 2: Serve the application using NGINX
FROM nginx:alpine

# Copy the build files from the previous stage
COPY --from=build /app/dist/angular-app/usr/share/nginx/html

# Copy custom NGINX configuration (optional)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose the port NGINX will serve on
EXPOSE 80

# Start NGINX server
CMD ["nginx", "-g", "daemon off;"]
