# Contribuindo com o ModelForge

## Como rodar

Veja a seção [Como rodar](README.md#como-rodar) do README.

## Testes e checagem de tipos

```bash
cd backend  && npm test && npx tsc --noEmit -p .
cd frontend && npx vitest run && npx tsc --noEmit -p .
```

Todos devem passar antes de enviar uma alteração.

## Fluxo de contribuição

1. Faça um **fork** do repositório e crie uma branch para a sua alteração.
2. Faça commits pequenos e com mensagens claras; inclua testes quando mudar comportamento.
3. Abra um **Pull Request** descrevendo o que mudou e por quê.

Esperamos que melhorias feitas em forks e versões modificadas sejam enviadas de volta ao repositório original,
em benefício de todos. Lembre-se de que a licença exige que versões modificadas, inclusive oferecidas como serviço
pela rede, tenham o código-fonte disponibilizado sob a mesma licença e preservem a atribuição de autoria (veja [NOTICE](NOTICE)).

## Licença das contribuições

Ao enviar uma contribuição, você concorda que ela será licenciada sob a AGPL-3.0-or-later, a mesma do projeto.
