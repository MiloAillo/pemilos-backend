export type AppError = {
    status: string;
    message: string;
    error?: object;
    statusCode: number;
};

export const isAppError = (error: unknown): error is AppError => {
    return (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        "status" in error &&
        "statusCode" in error
    );
};

export const createError = (status: string, message: string, statusCode: number, error?: unknown): AppError => {
    return { status, message, error: error as object, statusCode, };
};