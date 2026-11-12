# dsh-plugin-metric-dashboard — Metric Dashboard

Genera un dashboard SVG con tarjetas KPI y barras desde metricas JSON o CSV, con vista previa y guardado confirmado, sin dependencias.

## Herramientas

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `dashboard` | Generar dashboard |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-metric-dashboard` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-metric-dashboard
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_METRIC_DASHBOARD_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\metric-dashboard\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
