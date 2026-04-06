# Comparativo de Planos Power BI para Integração com SaaS

## 1. Power BI Pro

- **Indicação:** Uso interno, colaboração entre usuários da mesma organização.
- **Custo:** Aproximadamente R$ 107,10/mês por usuário (abril/2026, Microsoft Brasil)
- **Custo anual:** R$ 1.285,20 por usuário
- **Limitações:**
  - Não permite embed seguro para clientes externos (SaaS)
  - Não remove a mensagem de trial em dashboards embedados
  - Compartilhamento restrito a usuários internos

## 2. Power BI Embedded (A SKU)

- **Indicação:** Embed seguro de dashboards em aplicações SaaS, com autenticação e proteção de dados.
- **Custo:** Aproximadamente R$ 5,00/hora (A1 SKU, Azure Brasil, abril/2026)
- **Custo mensal (24h/dia):** R$ 3.600,00
- **Custo anual (24h/dia):** R$ 43.800,00
- **Custo mensal (8h/dia úteis):** R$ 880,00
- **Custo anual (8h/dia úteis):** R$ 10.560,00
- **Vantagens:**
  - Remove a mensagem de trial
  - Permite embed seguro para múltiplos workspaces e usuários
  - Cobrança por capacidade, não por usuário ou workspace
  - Pode ser pausado para economizar

## 3. Comparação Resumida

| Plano                | Mensal (24h/dia) | Anual (24h/dia) | Mensal (8h/dia úteis) | Anual (8h/dia úteis) |
| -------------------- | ---------------- | --------------- | --------------------- | -------------------- |
| Power BI Pro         | R$ 107,10        | R$ 1.285,20     | R$ 107,10             | R$ 1.285,20          |
| Power BI Embedded A1 | R$ 3.600,00      | R$ 43.800,00    | R$ 880,00             | R$ 10.560,00         |

## 4. Segurança e Uso

- **Power BI Pro:** Não recomendado para embed em SaaS, pois não protege contra vazamento de dados e não oferece autenticação para clientes externos.
- **Power BI Embedded:** Única opção segura e suportada pela Microsoft para embed em SaaS, com autenticação, controle de acesso e proteção dos dados.

## 5. Como Usar o Power BI Embedded

1. Contrate uma capacidade Embedded (A SKU) no portal Azure.
2. Associe todos os workspaces usados no embed a essa capacidade.
3. Use o modelo "embed for your customers" (app owns data) para gerar tokens de acesso e integrar os dashboards ao seu SaaS.
4. O custo será calculado pelo tempo em que a capacidade estiver ativa, independente do número de workspaces ou usuários finais.

## 6. Observações

- O Embedded pode ser pausado fora do horário de uso para economizar.
- Não existe alternativa oficial da Microsoft para embed seguro em SaaS sem a capacidade Embedded.
- O Pro pode ser usado em conjunto para desenvolvimento e colaboração interna, mas não substitui o Embedded para embed externo.

---

**Dúvidas ou simulações de custo para outros SKUs ou regiões, consulte a calculadora do Azure ou peça uma simulação personalizada.**
