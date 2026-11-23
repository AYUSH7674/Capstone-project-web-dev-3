# Campus Management API

A focused backend for everyday university workflows: account access, course sections, enrolment, attendance, reports, and announcements. It is designed as a solo capstone, with a clear MVC structure and room to add features as you learn.

## What works in this starter

- Role-based access for administrators, faculty, and students
- Password hashing and rotating JWT access/refresh tokens
- User, course, section, and enrolment workflows with paginated lists, safe updates, and archive/withdraw actions
- Attendance marking, student-only personal history, and attendance summaries
- Campus and section announcements, delivered over Socket.IO
- Central error responses, request logging, input limits, API rate limiting, and MongoDB indexes
- An internal `EventEmitter` for announcement and attendance domain events

## Stack

Node.js · Express · MongoDB · Mongoose · Socket.IO

## Run it locally

You need Node.js 20 or later and a MongoDB instance (local or hosted).

1. Copy `.env.example` to `.env` and set the database URI plus two long, different JWT secrets.
2. Set a private `SEED_ADMIN_PASSWORD` in `.env` (at least eight characters).
3. Install dependencies with `npm install`.
4. Create the initial administrator with `npm run seed`.
5. Start the API using `npm run dev` (or `npm start`).
6. Open `http://localhost:4000/health`; a healthy response confirms the server started.

Never commit `.env`. The seed command creates only the initial administrator and stops if that email already exists.

## Project layout

```text
src/
  config/          environment and MongoDB setup
  controllers/     request workflows and business rules
  events/          application event emitter
  middleware/      authentication, roles, and centralized errors
  models/          Mongoose schemas and indexes
  routes/          REST endpoint definitions
  utils/           response helpers and JWT creation
  app.js           Express configuration
  server.js        HTTP, Socket.IO, and startup
  seed.js          initial administrator setup
postman/           importable API workflow and test collection
```

Each request follows `Route → Middleware → Controller → Model → MongoDB → Response`. Controllers contain the workflow rules; schemas enforce data shape and uniqueness at the database boundary.

## Data model

```text
User ──< Enrollment >── Section ──> Course
  │                         │
  ├──< Attendance >─────────┤
  └──< Announcement author  └── faculty (User)
```

An enrollment joins one student to one section. Attendance is unique per student, section, and class date. A section has one assigned faculty member and belongs to one course. Announcements can target the whole campus or a section.

## API map

Protected endpoints expect `Authorization: Bearer <accessToken>`. Login and refresh are public. Responses use `{ success, message, data }`; paginated lists also include `meta`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Sign in and receive access/refresh tokens |
| `POST` | `/api/auth/refresh` | Public | Rotate a refresh token |
| `POST` | `/api/auth/logout` | Signed in | Revoke a refresh token |
| `GET` | `/api/auth/me` | Signed in | Return the current account |
| `PATCH` | `/api/auth/me` | Signed in | Update permitted profile fields |
| `GET` | `/api/users` | Admin | List active users; supports `role`, `page`, and `limit` |
| `GET` | `/api/users/:id` | Admin | Retrieve one active account |
| `POST` | `/api/users` | Admin | Create a student or faculty account |
| `PATCH` | `/api/users/:id` | Admin | Update a non-admin account |
| `DELETE` | `/api/users/:id` | Admin | Deactivate a non-admin account |
| `GET` | `/api/courses` | Signed in | List active courses; supports `department`, `page`, and `limit` |
| `POST` | `/api/courses` | Admin | Create a course |
| `GET` | `/api/courses/:id` | Signed in | Retrieve one active course |
| `PATCH` | `/api/courses/:id` | Admin | Update a course |
| `DELETE` | `/api/courses/:id` | Admin | Archive a course after its sections are deactivated |
| `GET` | `/api/sections` | Signed in | List visible active sections; supports `course`, `page`, and `limit` |
| `POST` | `/api/sections` | Admin | Create a section with a faculty assignment |
| `GET` | `/api/sections/:id` | Signed in | Retrieve a section if visible to the current role |
| `PATCH` | `/api/sections/:id` | Admin | Update section details or faculty assignment |
| `DELETE` | `/api/sections/:id` | Admin | Deactivate a section after active enrolments are withdrawn |
| `POST` | `/api/enrollments` | Admin | Enrol a student in a section |
| `GET` | `/api/enrollments` | Signed in | Students see their enrolments; faculty need their section; admins can filter by section |
| `DELETE` | `/api/enrollments/:id` | Admin | Withdraw an active enrolment |
| `GET` | `/api/reports/enrollment-counts` | Admin | Section enrolment counts using MongoDB aggregation |
| `POST` | `/api/attendance` | Faculty/Admin | Record or correct a section's attendance for a date |
| `GET` | `/api/attendance/sections/:sectionId` | Faculty/Admin | Browse attendance for an assigned section; optional `date`, `page`, and `limit` |
| `PATCH` | `/api/attendance/:id` | Faculty/Admin | Correct a record while preserving who made the latest change |
| `GET` | `/api/attendance/me` | Student | View only the signed-in student's attendance |
| `GET` | `/api/attendance/reports/sections/:sectionId` | Faculty/Admin | Attendance percentages and students below threshold |
| `GET` | `/api/announcements` | Signed in | List campus announcements and announcements visible to the user |
| `POST` | `/api/announcements` | Faculty/Admin | Publish a campus or section announcement |
| `GET` | `/api/announcements/:id` | Signed in | Retrieve an announcement visible to the current user |
| `PATCH` | `/api/announcements/:id` | Faculty/Admin | Edit your own announcement or any announcement as admin |
| `DELETE` | `/api/announcements/:id` | Faculty/Admin | Archive your own announcement or any announcement as admin |

Most lists use pagination (`page` and `limit`, maximum 100). Roles are assigned when an account is created and cannot be changed through profile edits. Deletes that would break academic history are soft actions: accounts and courses are deactivated or archived, and enrolments are marked withdrawn. The API blocks archiving courses with active sections and deactivating sections or accounts that still have active enrolments or assignments.

### Attendance request example

```json
{
  "section": "SECTION_OBJECT_ID",
  "sessionDate": "2026-11-14",
  "records": [
    { "student": "STUDENT_OBJECT_ID", "status": "present" },
    { "student": "ANOTHER_STUDENT_ID", "status": "absent", "note": "Reported sick" }
  ]
}
```

Only enrolled students can be included. Faculty can mark attendance only for their own assigned sections. Repeating the same section/date updates the existing record rather than creating a duplicate.

## Real-time events

Socket.IO connections authenticate with the short-lived access token:

```js
const socket = io('http://localhost:4000', { auth: { token: accessToken } });
socket.on('announcement:new', (announcement) => { /* update the screen */ });
socket.on('announcement:updated', (announcement) => { /* refresh the announcement */ });
socket.on('announcement:archived', ({ id }) => { /* remove it from the screen */ });
socket.on('attendance:updated', (update) => { /* refresh the summary */ });
```

Students and faculty join only the section rooms they belong to or teach. Campus announcements are broadcast to connected authenticated clients. The announcement create/update/archive and attendance-marked internal events are handled by `EventEmitter`, keeping business workflows separate from socket delivery.

## Postman collection

Import `postman/CampusManagementAPI.postman_collection.json` into Postman. Set the `adminPassword` collection variable to the initial admin password, then run the requests in order. The login request stores the access token automatically. The collection covers successful workflows, invalid course data, a missing course, a missing token, and a student role restriction. Its example student and faculty accounts use reserved `.test` email addresses; replace them if you have already created accounts with those email addresses.

## Capstone scope

This starter focuses on a complete first academic workflow. Optional timetable, file uploads, downloadable reports, and a detailed attendance audit history can be added later. Keep each addition small enough that you can explain the route, middleware, controller, model, and database behavior during your demo.

## Security notes

- Passwords are hashed with bcryptjs and never included in returned user objects.
- Refresh tokens are stored as SHA-256 digests and rotated after use.
- The first administrator is created locally through the seed command; open public registration is intentionally disabled.
- Use HTTPS and a specific `CLIENT_ORIGIN` when deploying. Rotate any secret that has been shared or committed.

