import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

#Este archivo será el encargado de "hablar" con Postgres.

# Cargamos los datos del archivo .env
load_dotenv()

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_NAME = os.getenv("DB_NAME")

# Creamos la URL de conexión para PostgreSQL
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Definimos nuestra tabla de canciones
class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    file_path = Column(String)
    youtube_url = Column(String)

# Función para crear las tablas físicamente en Postgres
def init_db():
    Base.metadata.create_all(bind=engine)
    print("¡Tablas creadas correctamente en PostgreSQL!")

if __name__ == "__main__":
    init_db()
