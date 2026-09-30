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

## Gravando o demo do README

O topo do README mostra `docs/demo.gif`, um GIF curto (20-30s) do fluxo Conceitual → diálogo de decisão → Lógico → DDL —
é o item de maior impacto para quem descobre o projeto (ex.: LinkedIn, Hacker News). Para regravar/atualizar:

1. Suba o backend e o frontend (veja [Como rodar](README.md#como-rodar)).
2. Grave a tela só da janela do navegador com uma ferramenta leve: [Peek](https://github.com/phw/peek) (Linux, exporta
   GIF direto), [ScreenToGif](https://www.screentogif.com/) (Windows) ou `ffmpeg` + [gifski](https://gif.ski/) para
   melhor qualidade/tamanho (grave em `.mp4` e converta: `ffmpeg -i demo.mp4 frame%04d.png && gifski -o demo.gif frame*.png`).
3. Roteiro sugerido: criar duas ou três entidades no Conceitual → converter para Lógico (mostrando um diálogo de
   decisão) → gerar DDL. Mantenha embaixo de 30s e 5-8 MB (limite comum de preview no GitHub).
4. Substitua `docs/demo.gif` pelo novo arquivo (mesmo nome e caminho, sem precisar editar o README).

## Licença das contribuições

Ao enviar uma contribuição, você concorda que ela será licenciada sob a AGPL-3.0-or-later, a mesma do projeto.
