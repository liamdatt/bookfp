# FloPro book — one static HTML file behind nginx.
FROM nginx:alpine
COPY flopro-book.html /usr/share/nginx/html/index.html
EXPOSE 80
