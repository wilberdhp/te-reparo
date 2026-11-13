# Análisis del inventario "inventario republica organizado.xlsx" antes de
# convertirlo a JSON: valores distintos por columna, vacíos, duplicados y
# calidad de los números.
import sys
from collections import Counter
from openpyxl import load_workbook

RUTA = "/home/z/my-project/upload/inventario republica organizado.xlsx"

wb = load_workbook(RUTA, read_only=True, data_only=True)
ws = wb["Hoja1"]

filas = []
for i, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    filas.append((i, fila))
wb.close()

cabeceras = ["PRODUCTO", "CANTIDAD", "CATEGORIA", "TIPO", "UNIDAD", "COSTO",
             "STOCK MINIMO", "PRECIO", "MONEDA PRECIO", "PAGO OPERARIO TIPO",
             "PAGO OPERARIO VALOR", "GARANTIA DIAS"]

def valor(fila, col):
    return fila[col]

print(f"Filas de datos: {len(filas)}")

# Filas completamente vacías
vacias = [num for num, f in filas if all(v is None or (isinstance(v, str) and not v.strip()) for v in f)]
print(f"Filas completamente vacías: {len(vacias)}")

# Producto vacío
sin_nombre = [num for num, f in filas if not (valor(f, 0) and str(valor(f, 0)).strip())]
print(f"Filas sin PRODUCTO: {len(sin_nombre)} {sin_nombre[:10]}")

# Nulos por columna
print("\n== NULOS/VACÍOS POR COLUMNA ==")
for c, cab in enumerate(cabeceras):
    nulos = sum(1 for _, f in filas if valor(f, c) is None or (isinstance(valor(f, c), str) and not valor(f, c).strip()))
    print(f"  {cab}: {nulos}")

# Valores distintos de columnas categóricas
print("\n== VALORES DISTINTOS (categóricas) ==")
for c in [2, 3, 4, 8, 9]:  # CATEGORIA, TIPO, UNIDAD, MONEDA, PAGO TIPO
    print(f"  {cabeceras[c]}:")
    for val, n in Counter(str(valor(f, c)) for _, f in filas).most_common(30):
        print(f"    {val!r}: {n}")

# Calidad de números
print("\n== NÚMEROS: tipos por columna ==")
for c in [1, 5, 6, 7, 10, 11]:  # CANTIDAD, COSTO, STOCK, PRECIO, PAGO VALOR, GARANTIA
    tipos = Counter(type(valor(f, c)).__name__ for _, f in filas)
    raros = [(num, valor(f, c)) for num, f in filas if isinstance(valor(f, c), str)][:8]
    print(f"  {cabeceras[c]}: {dict(tipos)} | strings raras: {raros}")

# Duplicados de nombre
nombres = Counter(str(valor(f, 0)).strip().lower() for _, f in filas if valor(f, 0))
dups = {n: k for n, k in nombres.items() if k > 1}
print(f"\nNombres duplicados: {len(dups)}")
for n, k in sorted(dups.items(), key=lambda x: -x[1])[:15]:
    print(f"    {n!r} × {k}")

# Muestras
print("\n== PRIMERAS 5 FILAS ==")
for num, f in filas[:5]:
    print(f"  fila {num}: {f}")
print("== ÚLTIMAS 5 FILAS ==")
for num, f in filas[-5:]:
    print(f"  fila {num}: {f}")

# Negativos / ceros
for c, cab in [(1, "CANTIDAD"), (5, "COSTO"), (7, "PRECIO")]:
    negs = [(num, valor(f, c)) for num, f in filas if isinstance(valor(f, c), (int, float)) and valor(f, c) < 0]
    print(f"\n{cab} negativos: {len(negs)} {negs[:5]}")
