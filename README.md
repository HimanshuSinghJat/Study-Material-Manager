# Study Material Manager

A full-stack web application to upload, organize, and manage study materials with authentication and folder-based structure.

---

## Features

- User authentication (Login & Signup using JWT)
- Create and manage folders
- Upload study materials (PDFs and files)
- View files inside folders
- Download and delete files
- User profile dropdown with name and email
- Clean and responsive UI

---

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB (Atlas)
- Authentication: JWT, bcrypt
- File Upload: Multer

---

## Project Structure

```
study-material-manager/
│── frontend/
│   ├── index.html
│   ├── login.html
│   ├── signup.html
│   └── view.html
│
│── models/
│   ├── User.js
│   └── Material.js
│
│── uploads/
│── server.js
│── package.json
```

---

## Future Improvements

- Separate Folder model for better scalability
- Search functionality
- Dark mode UI
- Cloud storage integration

---

## Author

Himanshu Singh Jat
