from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg import Error as DatabaseError

from admin_auth import router as admin_auth_router
from students import router as students_router
from faculty import router as faculty_router
from email_settings import router as email_settings_router
from student_auth import router as student_auth_router
from programme import router as programme_router
from google_drive import router as google_drive_router
from submissions import router as submissions_router
from faculty_auth import router as faculty_auth_router
from faculty_portal import router as faculty_portal_router
from runtime_config import validate_runtime_config


@asynccontextmanager
async def lifespan(app):
	validate_runtime_config()
	yield


app = FastAPI(title="Applied AI", lifespan=lifespan)
app.include_router(admin_auth_router)
app.include_router(students_router)
app.include_router(faculty_router)
app.include_router(email_settings_router)
app.include_router(student_auth_router)
app.include_router(programme_router)
app.include_router(google_drive_router)
app.include_router(submissions_router)
app.include_router(faculty_auth_router)
app.include_router(faculty_portal_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request, error):
	return JSONResponse(
		status_code=422,
		content={
			"detail": [
				{"loc": item["loc"], "type": item["type"], "msg": item["msg"]}
				for item in error.errors()
			]
		},
		headers={"Cache-Control": "no-store"},
	)


@app.exception_handler(DatabaseError)
async def database_error(request, error):
	return JSONResponse(
		status_code=503,
		content={"detail": "Authentication is temporarily unavailable."},
		headers={"Cache-Control": "no-store"},
	)