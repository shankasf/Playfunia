from fastapi import FastAPI

app = FastAPI(title='Playfunia Chatbot Service')


@app.get('/health', tags=['health'])
def health_check() -> dict[str, str]:
    return {
        'status': 'ok',
        'service': 'chatbot',
    }


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('app.main:app', host='0.0.0.0', port=8000, reload=True)

