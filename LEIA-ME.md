# Reserva de Salas | FEA Júnior USP

Site para reservar cadeiras (ou a sala inteira) na sede. Cada pessoa informa o nome, escolhe o dia, o horário e o lugar. Se o lugar estiver ocupado, o site mostra até que horas e por quem, e sugere reservar a partir do horário em que fica livre.

## Como funciona por dentro

- **Site** (pasta `public/`): páginas estáticas, servidas pelo Netlify.
- **Servidor** (`netlify/functions/reservas.mjs`): uma Netlify Function no endereço `/api/reservas`, que lista, cria e cancela reservas.
- **Dados**: Netlify Blobs, o armazenamento do próprio Netlify. Não é preciso criar banco de dados nem conta em outro serviço. As reservas de cada dia ficam num registro próprio.
- **Sem conflito duplo**: quem decide se um lugar está livre é o servidor, no momento de gravar. Se duas pessoas clicarem ao mesmo tempo, só a primeira consegue, e a segunda recebe o aviso de quem reservou. Isso foi testado com 20 pedidos simultâneos para o mesmo lugar: 1 gravou e 19 foram recusados.
- **Sala inteira**: a reserva da sala inteira bloqueia todas as cadeiras daquela sala no horário, e vice-versa.
- **Cancelar**: cada reserva só pode ser cancelada no aparelho em que foi feita, porque o site guarda uma chave secreta no navegador. A diretoria pode cancelar qualquer reserva (veja abaixo).

## Publicar no Netlify

Arrastar a pasta para o Netlify Drop **não funciona**, porque esse modo não roda a parte de servidor. Use uma das opções abaixo.

### Opção 1: pelo GitHub (recomendada)

1. Crie um repositório no GitHub e envie todo o conteúdo desta pasta, exceto `node_modules`.
2. No Netlify, clique em **Add new project → Import an existing project** e escolha o repositório.
3. Deixe o comando de build em branco. As configurações já estão no `netlify.toml`.
4. Clique em **Deploy**. Em alguns minutos o site fica disponível em um endereço `algumacoisa.netlify.app`, que dá para renomear em **Project configuration → Change project name**.

A cada alteração enviada ao GitHub, o Netlify publica de novo automaticamente.

### Opção 2: pelo terminal

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

Na primeira vez, o comando pergunta se é para criar um projeto novo. Responda que sim.

## Proteção opcional

Sem login, qualquer pessoa com o link consegue reservar. Para limitar o acesso ao pessoal da empresa, crie variáveis de ambiente em **Project configuration → Environment variables** e publique de novo:

| Variável | Para que serve |
|---|---|
| `CODIGO_ACESSO` | Código que todos digitam uma única vez, junto com o nome. Sem ele o site não mostra nem grava reservas. |
| `CODIGO_DIRETORIA` | Permite cancelar a reserva de qualquer pessoa. Para usar, abra o site com `?diretoria` no fim do endereço (ex.: `https://seusite.netlify.app/?diretoria`) e digite o código. |

## Mudar salas, cadeiras e horários

Tudo fica em `public/config.js`, usado tanto pelo site quanto pelo servidor:

- `HORA_INICIO`, `HORA_FIM` e `PASSO`: horário de funcionamento e tamanho dos blocos (hoje 7h às 22h, de 30 em 30 minutos).
- `DIAS_ANTECEDENCIA`: até quantos dias à frente dá para reservar (hoje 60).
- `SALAS`: nome, apelido, cor e lugares de cada sala. **A quantidade de cadeiras atual veio da planta desenhada a partir do vídeo e precisa ser conferida na sede.** Para remover uma cadeira, apague a posição dela na função da sala. A numeração é refeita sozinha.

Se já houver reservas e você diminuir o número de cadeiras, as reservas das cadeiras removidas continuam gravadas, mas deixam de aparecer na planta.

## Testar no computador antes de publicar

Precisa do Node.js 18 ou mais novo.

```bash
npm install
npm run local
```

Abra `http://localhost:8888`. Nesse modo as reservas ficam só na memória e somem quando o servidor é desligado.

## Custos

O plano gratuito do Netlify funciona por créditos mensais com limite rígido: se os créditos acabarem, o site fica fora do ar até o mês seguinte. Cada publicação (deploy) também gasta créditos, então evite publicar muitas vezes por mês. Acompanhe o consumo em **Usage & billing** no painel do Netlify, principalmente nas primeiras semanas de uso.

O site já foi feito para economizar: ele só busca dados do dia que está na tela, atualiza a cada 45 segundos apenas quando a aba está aberta e em primeiro plano, e confere de novo com o servidor na hora de reservar.
