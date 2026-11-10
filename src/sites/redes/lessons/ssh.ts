import type { LessonModule, Params } from "../../../contracts/types.ts";
import { blob, nameList, raw, SSH_MSG, sshPacket, sshVersion } from "../../../sim/net/ssh.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { LIA } from "../plan.ts";
import { opaque, tcpSession } from "../wire.ts";

/**
 * SSH: version exchange, algorithm negotiation (KEXINIT), Curve25519 key exchange, the host key
 * check against known_hosts, NEWKEYS, and public-key user authentication inside the cipher.
 */
const SEED = 4253;
export const LAB = { ip: "192.0.2.22", host: "lab.campus.example" } as const;
const FP = "SHA256:p3Xq0c9yB7d1sM4kT2wZf8uJ6hN5vR0aE1iL3oQ7gYc";
export const DEFAULTS = { conhecido: false, trocada: false };

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Terminal da Lia", sub: `${LIA.ip}:${LIA.port}` },
    { id: "net", kind: "cloud", label: "Rede", w: 120 },
    { id: "srv", kind: "server", label: "Servidor do laboratório", sub: `${LAB.ip}:22` },
  ],
  { height: 420, widgets: [{ kind: "counter", id: "fase", title: "Fase", at: [60, 250] }] },
);

export function build(p: Params) {
  const conhecido = p.conhecido === true;
  const trocada = p.trocada === true;
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", net: "Rede", srv: "Servidor" });
  const rand = prng(SEED);
  const s = tcpSession(
    { ip: LIA.ip, port: LIA.port },
    { ip: LAB.ip, port: 22 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
  );
  let n = 0;
  const go = (
    fromCli: boolean,
    label: string,
    layer: Parameters<typeof s.data>[1],
    title: string,
    summary: string,
    role: "a" | "b" | "crypto" = fromCli ? "a" : "b",
  ) => {
    n++;
    c.send(fromCli ? "lia" : "srv", fromCli ? "srv" : "lia", label, {
      dt: 15,
      via: ["net"],
      role,
      frame: s.data(fromCli, layer, { id: `f-${n}`, title, summary }),
    });
  };
  const kexinit = () =>
    sshPacket(SSH_MSG.kexinit, "KEXINIT", [
      raw("Cookie", Array(16).fill(null), "16 bytes aleatórios"),
      nameList(
        "Troca de chaves",
        ["curve25519-sha256", "ecdh-sha2-nistp256"],
        "A primeira da lista do cliente que o servidor também aceite",
      ),
      nameList("Chave do servidor", ["ssh-ed25519", "rsa-sha2-512"]),
      nameList("Cifra cliente→servidor", ["chacha20-poly1305@openssh.com", "aes256-gcm@openssh.com"]),
      nameList("Cifra servidor→cliente", ["chacha20-poly1305@openssh.com", "aes256-gcm@openssh.com"]),
      nameList("MAC cliente→servidor", ["hmac-sha2-256-etm@openssh.com"], "Ignorado com cifras AEAD"),
      nameList("MAC servidor→cliente", ["hmac-sha2-256-etm@openssh.com"]),
      nameList("Compressão cliente→servidor", ["none"]),
      nameList("Compressão servidor→cliente", ["none"]),
      nameList("Idiomas", []),
      nameList("Idiomas", []),
      raw("Primeira troca segue", [0], "não"),
      raw("Reservado", [0, 0, 0, 0], "0"),
    ]);

  b.step(
    {
      id: "s1-versao",
      title: "Quem fala qual versão",
      subtitle: "Uma linha de texto de cada lado",
      text: "Depois do handshake TCP na porta 22, cada lado manda uma linha de texto com a versão do protocolo e o nome do programa. É a única parte do [[ssh]] em texto: daí em diante tudo vai em pacotes binários, com tamanho, enchimento e, em pouco tempo, cifra. Versões antigas, como a 1.x, são recusadas aqui.",
      facts: [
        ["Porta", "22"],
        ["Cliente", "SSH-2.0-cliente_didatico"],
        ["Servidor", "SSH-2.0-servidor_didatico"],
      ],
      highlight: ["lia", "srv"],
    },
    () => {
      c.count("fase", "conexão", { label: "Fase: conexão" });
      c.send("lia", "srv", "SYN", { dt: 15, via: ["net"], frame: s.syn("f-syn") });
      c.send("srv", "lia", "SYN-ACK", { dt: 15, via: ["net"], role: "b", frame: s.synAck("f-synack") });
      c.send("lia", "srv", "ACK", { dt: 0, via: ["net"], frame: s.ack(true, "f-ack") });
      go(
        false,
        "versão",
        sshVersion("SSH-2.0-servidor_didatico"),
        "Versão do servidor",
        "Texto, terminado em CRLF.",
      );
      go(
        true,
        "versão",
        sshVersion("SSH-2.0-cliente_didatico"),
        "Versão do cliente",
        "Texto, terminado em CRLF.",
      );
    },
  );

  b.step(
    {
      id: "s2-kexinit",
      title: "Escolhendo os algoritmos",
      subtitle: "KEXINIT: listas em ordem de preferência",
      text: "Os dois lados mandam um **KEXINIT** ao mesmo tempo, com listas de algoritmos em ordem de preferência: troca de chaves, tipo de chave do servidor, cifra, MAC e compressão. Para cada item vale o primeiro da lista do **cliente** que o servidor também tenha. Aqui: Curve25519 para combinar a chave, Ed25519 para o servidor provar quem é e ChaCha20-Poly1305 para cifrar.",
      facts: [
        ["Troca de chaves", "curve25519-sha256"],
        ["Chave do servidor", "ssh-ed25519"],
        ["Cifra", "chacha20-poly1305"],
      ],
      highlight: ["lia", "srv"],
    },
    () => {
      c.count("fase", "negociação", { label: "Fase: negociação" });
      go(true, "KEXINIT", kexinit(), "KEXINIT do cliente", "As preferências do cliente.");
      go(false, "KEXINIT", kexinit(), "KEXINIT do servidor", "As preferências do servidor.");
    },
  );

  b.step(
    {
      id: "s3-ecdh",
      title: "Um segredo combinado",
      subtitle: "Curve25519 e o hash da troca",
      text: "O cliente sorteia um par de chaves temporário e manda a metade pública (32 bytes). O servidor faz o mesmo e responde com três coisas: a própria chave pública temporária, a sua **chave de servidor** permanente e uma **assinatura** sobre o hash de tudo o que foi trocado até aqui. Cada lado combina a sua metade secreta com a pública do outro e chega ao mesmo segredo: é o [[diffie-hellman]].",
      facts: [
        ["Chave temporária", "32 bytes de cada lado"],
        ["Assinatura", "Ed25519, 64 bytes"],
        ["Segredo", "nunca passa pela rede"],
      ],
      highlight: ["srv"],
    },
    () => {
      c.count("fase", "troca de chaves", { label: "Fase: troca de chaves" });
      go(
        true,
        "ECDH_INIT",
        sshPacket(SSH_MSG.ecdhInit, "KEX_ECDH_INIT", [
          blob("Chave pública temporária do cliente", 32, "32 bytes (Curve25519)"),
        ]),
        "ECDH_INIT",
        "A metade pública do cliente.",
      );
      go(
        false,
        "ECDH_REPLY",
        sshPacket(SSH_MSG.ecdhReply, "KEX_ECDH_REPLY", [
          blob(
            "Chave do servidor (Ed25519)",
            51,
            "a chave permanente do servidor",
            "É ela que o known_hosts confere",
          ),
          blob("Chave pública temporária do servidor", 32, "32 bytes (Curve25519)"),
          blob(
            "Assinatura do hash da troca",
            83,
            "Ed25519 sobre H",
            "Só quem tem a chave privada do servidor consegue gerar",
          ),
        ]),
        "ECDH_REPLY",
        "Chave do servidor, a metade dele e a assinatura.",
      );
    },
  );

  const ok = conhecido && !trocada;
  b.step(
    {
      id: "s4-hostkey",
      title: trocada ? "A chave mudou!" : conhecido ? "Servidor conhecido" : "Primeira vez",
      subtitle: "O cliente confere a chave do servidor",
      text: trocada
        ? `O arquivo known_hosts da Lia guarda outra chave para ${LAB.host}. Ou o servidor foi reinstalado, ou alguém no meio está se passando por ele. O cliente **interrompe a conexão** com um aviso em letras grandes e não aceita continuar sem que a Lia remova a entrada antiga de propósito. A assinatura confere, mas é de outra chave.`
        : conhecido
          ? `A chave recebida é a mesma guardada no known_hosts da Lia para ${LAB.host}, e a assinatura confere. O cliente segue sem perguntar nada: ela já confiou nessa chave antes e nada mudou.`
          : `A Lia nunca se conectou a este servidor. O cliente mostra a impressão digital da chave (${FP}) e pergunta se ela confia. Se a Lia conferir esse valor com o administrador e aceitar, ele vai para o known_hosts. É o modelo **confiar na primeira vez**: protege todas as conexões seguintes, mas não a primeira.`,
      facts: [
        ["Impressão digital", FP],
        ["known_hosts", trocada ? "chave diferente" : conhecido ? "mesma chave" : "sem entrada"],
        ["Resultado", trocada ? "conexão interrompida" : ok ? "segue" : "pergunta à Lia"],
      ],
      highlight: ["lia"],
      quiz: {
        kind: "choice",
        prompt: "Num dia normal, o SSH avisa que a chave do servidor mudou. O que isso pode indicar?",
        options: [
          "Que a senha da Lia expirou",
          "Que o servidor foi reinstalado ou que há alguém no meio",
          "Que a cifra foi trocada para AES",
          "Nada importante: é só atualizar",
        ],
        answer: 1,
        explain:
          "A chave do servidor deveria ser sempre a mesma. Se mudou, ou ele foi refeito, ou um **intermediário** está respondendo com a própria chave. Só se confirma com quem administra o servidor.",
      },
    },
    () => {
      c.state("lia", trocada ? "AVISO: chave mudou" : ok ? "known_hosts: ok" : "confiar? (sim)", {
        dt: 1,
        tone: trocada ? "bad" : ok ? "good" : "warn",
        role: trocada ? "bad" : "b",
        label: trocada ? "Chave diferente: conexão interrompida" : "Chave do servidor conferida",
      });
    },
  );

  b.step(
    {
      id: "s5-newkeys",
      quiz: {
        kind: "choice",
        prompt: "Em que momento a Lia prova quem é para o servidor?",
        options: [
          "Só depois do NEWKEYS, já dentro da cifra",
          "Na linha de versão, que vai em texto",
          "No KEXINIT, junto com a lista de algoritmos",
        ],
        answer: 0,
        explain:
          "O SSH primeiro combina as chaves e autentica o servidor; só então o cliente se identifica. Assim, nem o nome de usuário nem a prova de identidade aparecem para quem observa a rede.",
      },
      title: "Daqui em diante, cifrado",
      subtitle: "NEWKEYS e as chaves de sessão",
      text: trocada
        ? "Como a conexão foi interrompida, nada mais é enviado: o cliente não chega a mandar o NEWKEYS, e a senha ou a chave da Lia nunca saem do notebook. Abrir mão da conexão é justamente a proteção."
        : "Do segredo combinado e do hash da troca saem as chaves de sessão, uma para cada sentido. Cada lado manda **NEWKEYS**, e todo pacote seguinte vai cifrado e autenticado: quem observa a rede vê só o tamanho. Repare que a Lia ainda nem disse quem é; o login acontece já dentro da cifra.",
      facts: trocada
        ? [["Enviado depois do aviso", "nada"]]
        : [
            ["Mensagem", "NEWKEYS (21)"],
            ["Chaves de sessão", "uma por sentido"],
          ],
      highlight: ["net"],
    },
    () => {
      if (trocada) {
        c.state("lia", "conexão encerrada", { dt: 1, tone: "bad", role: "bad" });
        return;
      }
      c.count("fase", "cifrado", { label: "Fase: cifrado", role: "crypto" });
      go(
        true,
        "NEWKEYS",
        sshPacket(SSH_MSG.newkeys, "NEWKEYS", []),
        "NEWKEYS do cliente",
        "Último pacote em claro.",
      );
      go(
        false,
        "NEWKEYS",
        sshPacket(SSH_MSG.newkeys, "NEWKEYS", []),
        "NEWKEYS do servidor",
        "Último pacote em claro.",
      );
    },
  );

  if (!trocada)
    b.step(
      {
        id: "s6-login",
        title: "Login com chave",
        subtitle: "Prova de posse, sem mandar segredo",
        text: "A Lia entra com uma **chave pública**: o servidor tem a metade pública no arquivo authorized_keys dela, e o cliente assina com a metade privada um dado que inclui o identificador desta sessão. Nenhuma senha cruza a rede, e uma assinatura gravada não serve para outra sessão. Por fim, o cliente abre um canal e pede um terminal.",
        facts: [
          ["Método", "publickey (Ed25519)"],
          ["Segredo enviado", "nenhum"],
          ["Canal", "sessão com terminal"],
        ],
        highlight: ["lia", "srv"],
      },
      () => {
        go(
          true,
          "pedido de login",
          opaque("ssh", "SSH (cifrado)", 128, "Pedido de autenticação, cifrado"),
          "Autenticação",
          "Só o tamanho aparece.",
          "crypto",
        );
        go(
          false,
          "sucesso",
          opaque("ssh", "SSH (cifrado)", 32, "Autenticação aceita, cifrado"),
          "Resposta",
          "Só o tamanho aparece.",
          "crypto",
        );
        go(
          true,
          "abre canal",
          opaque("ssh", "SSH (cifrado)", 64, "Pedido de canal, cifrado"),
          "Canal",
          "Só o tamanho aparece.",
          "crypto",
        );
        c.state("lia", "lia@lab:~$", { dt: 1, tone: "good", label: "Terminal aberto" });
      },
    );

  return b.done({ packets: n, aborted: trocada ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "ssh",
    site: "redes",
    title: "SSH: um terminal cifrado",
    summary:
      "Versão, negociação de algoritmos, troca de chaves Curve25519, a chave do servidor no known_hosts e o login por chave pública.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.9.5",
        note: "Autenticação com criptografia de chave pública",
        verified: true,
      },
      { rfc: 4253, note: "Camada de transporte do SSH" },
      { rfc: 4252, note: "Autenticação de usuário" },
      { rfc: 8731, note: "Troca de chaves com Curve25519" },
    ],
    simplifications: [
      "Chaves, assinaturas e enchimento aparecem como bytes desconhecidos.",
      "Tamanhos dos pacotes cifrados aproximados.",
      "O cliente manda a versão depois do servidor só para caber na sequência; os dois podem mandar ao mesmo tempo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "conhecido", kind: "bool", label: "O servidor já está no known_hosts" },
      { key: "trocada", kind: "bool", label: "A chave do servidor mudou" },
    ],
  },
  build,
  intro: {
    text: "Administrar um servidor a distância exige um terminal que ninguém no caminho consiga ler nem alterar. O SSH resolve isso combinando uma chave nova a cada conexão e conferindo a identidade do servidor. Você vai seguir os primeiros pacotes, decidir se confia no servidor e entrar sem mandar senha.",
    facts: [
      ["Servidor", `${LAB.host} (${LAB.ip})`],
      ["Porta", "22"],
      ["Login", "chave pública"],
    ],
  },
  outro: {
    title: "SSH em resumo",
    text: "Depois da versão e da negociação, uma troca Diffie-Hellman gera as chaves e o servidor assina a troca com a chave permanente, que o cliente confere no known_hosts. O login acontece já dentro da cifra.",
    facts: (run) => [["Pacotes SSH na sequência", String(run.stats.packets)]],
  },
  next: ["ftp", "tls13"],
};

export default lesson;
