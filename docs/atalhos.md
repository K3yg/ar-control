# Siri e agendamentos (app Atalhos do iOS)

Base: `https://<projeto>.vercel.app`. Todas as chamadas levam o header `x-ac-key: <AC_API_KEY>`.

Em cada atalho, use a ação **Obter conteúdo de URL**:
- Método: `POST`
- Cabeçalhos: `x-ac-key` = sua chave
- (quando houver corpo) Corpo da solicitação: **JSON**

O nome do atalho é a frase da Siri.

## 1. "Liga o ar"
- URL: `/api/ac/preset/sleep` (liga, 25°, WindFree, display off; valores em `lib/presets.ts`)

## 2. "Desliga o ar"
- URL: `/api/ac/off`

## 3. "Ar em X graus"
1. Ação **Pedir entrada** → tipo Número → "Quantos graus?"
2. **Obter conteúdo de URL** → `/api/ac`, corpo JSON com o campo `temp` (Número) = *Entrada Fornecida*.

Outros corpos aceitos em `POST /api/ac` (todos opcionais):
```json
{ "power": "on", "temp": 25, "windFree": true, "display": false, "mode": "cool" }
```

## 4. Automação 04:00 (desligar)
Atalhos → Automação → **+** → Hora do Dia → 04:00, Diariamente → **Executar Imediatamente** → ação *Executar Atalho* "Desliga o ar".

## 5. Automação 07:00 (ligar)
Igual, às 07:00, rodando "Liga o ar".

O iPhone precisa de internet nesses horários.

## Testar com curl
```bash
curl -X POST https://<projeto>.vercel.app/api/ac/preset/sleep -H "x-ac-key: $AC_API_KEY"
curl https://<projeto>.vercel.app/api/ac -H "x-ac-key: $AC_API_KEY"
```
