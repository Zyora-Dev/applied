from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from auth import admin_router, login_router
from students import router as students_router
from faculty import router as faculty_router
from student_auth import router as student_auth_router


app = FastAPI(title="Applied AI Console API")
app.include_router(login_router)
app.include_router(admin_router)
app.include_router(students_router)
app.include_router(faculty_router)
app.include_router(student_auth_router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": [{"loc": issue["loc"], "msg": issue["msg"], "type": issue["type"]} for issue in error.errors()]},
        headers={"Cache-Control": "no-store"},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}