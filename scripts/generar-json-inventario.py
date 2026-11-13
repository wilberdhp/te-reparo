# Convierte "inventario republica organizado.xlsx" al JSON de productos del
# taller Te Reparo - República, siguiendo la estructura del modelo Producto de
# la app (prisma/schema.prisma).
#
# Mapeo de TIPO del Excel → TipoProducto de la app:
#  - VENTA                      → VENTA (accesorios con stock)
#  - ELECTRONICA con cantidad   → VENTA (piezas físicas con stock)
#  - ELECTRONICA sin cantidad   → SERVICIO_ELECTRONICA (mano de obra: ARREGLO,
#    CAMBIO PANTALLA/BATERIA/BASE/TAPA/BOTON, TRATAMIENTO, DIAGNOSTICO...)
#  - SOFTWARE                   → SERVICIO_INFORMATICA (desbloqueo, FRP, flasheo...)
#
# Datos faltantes: costo, precio y pago operario = 0 (indicación del usuario);
# cantidad/stock mínimo/garantía vacíos = 0; unidad 'u' (productos) / 'serv'
# (servicios). Códigos internos y de barras generados REP-NNNNNN por orden de
# fila. Categorías singular/plural unificadas (PANTALLA→PANTALLAS,
# TAPA TRASERA→TAPAS TRASERAS, COMPONETES DE COMPUTADORAS→COMPONENTES PARA PC).
import json
import re
from collections import Counter
from openpyxl import load_workbook

RUTA_XLSX = "/home/z/my-project/upload/inventario republica organizado.xlsx"
RUTA_JSON = "/home/z/my-project/prisma/productos-republica.json"
RUTA_DESCARGA = "/home/z/my-project/download/productos-te-reparo-republica.json"

CATEGORIAS_NORMALIZADAS = {
    "PANTALLA": "PANTALLAS",
    "TAPA TRASERA": "TAPAS TRASERAS",
    "COMPONETES DE COMPUTADORAS": "COMPONENTES PARA PC",
}


def limpiar(texto: str) -> str:
    return re.sub(r"\s+", " ", str(texto)).strip()


wb = load_workbook(RUTA_XLSX, read_only=True, data_only=True)
ws = wb["Hoja1"]
filas = list(ws.iter_rows(min_row=2, values_only=True))
wb.close()

productos = []
for i, f in enumerate(filas, start=1):
    nombre = limpiar(f[0])
    if not nombre:
        raise ValueError(f"Fila {i+1}: producto sin nombre")
    categoria = limpiar(f[2]).upper()
    categoria = CATEGORIAS_NORMALIZADAS.get(categoria, categoria)
    tipo_excel = limpiar(f[3]).upper()
    cantidad = f[1] if f[1] is not None else 0
    es_servicio = False
    if tipo_excel == "SOFTWARE":
        tipo, es_servicio = "SERVICIO_INFORMATICA", True
    elif tipo_excel == "ELECTRONICA":
        if f[1] is None:
            tipo, es_servicio = "SERVICIO_ELECTRONICA", True
        else:
            tipo = "VENTA"
    elif tipo_excel == "VENTA":
        tipo = "VENTA"
    else:
        raise ValueError(f"Fila {i+1}: TIPO desconocido {tipo_excel!r}")

    codigo = f"REP-{i:06d}"
    productos.append({
        "codigoInterno": codigo,
        "codigoBarras": codigo,
        "categoria": categoria,
        "nombre": nombre,
        "tipo": tipo,
        "cantidad": int(cantidad) if not es_servicio else 0,
        "costo": 0,
        "unidad": "serv" if es_servicio else "u",
        "stockMinimo": int(f[6]) if f[6] is not None else 0,
        "precio": 0,
        "monedaPrecio": limpiar(f[8]).upper(),
        "pagoOperarioTipo": "FIJO",
        "pagoOperarioValor": 0,
        "garantiaDias": int(f[11]) if f[11] is not None else 0,
    })

# ---- Validaciones (pipeline de calidad) ----
assert len(productos) == len(filas), "Filas perdidas en la conversión"
assert len({p["codigoInterno"] for p in productos}) == len(productos), "Códigos internos duplicados"
assert all(p["nombre"] for p in productos), "Nombres vacíos"
assert all(p["monedaPrecio"] in ("CUP", "USD", "EUR") for p in productos), "Moneda inválida"
assert all(p["tipo"] in ("VENTA", "SERVICIO_ELECTRONICA", "SERVICIO_INFORMATICA") for p in productos), "Tipo inválido"
assert all(p["cantidad"] >= 0 and p["stockMinimo"] >= 0 and p["garantiaDias"] >= 0 for p in productos), "Negativos"

salida = {"taller": "Te Reparo - República", "productos": productos}
for ruta in (RUTA_JSON, RUTA_DESCARGA):
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=2)

print(f"Productos convertidos: {len(productos)}")
print("Por tipo:", dict(Counter(p['tipo'] for p in productos)))
print(f"Categorías distintas: {len({p['categoria'] for p in productos})}")
print("Categorías normalizadas aplicadas:", {k: v for k, v in CATEGORIAS_NORMALIZADAS.items()})
print(f"Con stock > 0: {sum(1 for p in productos if p['cantidad'] > 0)}")
print(f"Servicios (sin stock): {sum(1 for p in productos if p['tipo'] != 'VENTA')}")
print(f"Con garantía > 0 días: {sum(1 for p in productos if p['garantiaDias'] > 0)}")
print("Unidades:", dict(Counter(p['unidad'] for p in productos)))
print(f"Monedas:", dict(Counter(p['monedaPrecio'] for p in productos)))
print("Primer producto:", productos[0])
print("Último producto:", productos[-1])
