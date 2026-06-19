function montarEmailHtml(convidado, baseUrl, evento) {
  const img = baseUrl + evento.conviteImagem;
  const nome = convidado.nome.replace(/</g, '&lt;');
  const link = convidado.link;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fdf6f3;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f3;padding:24px 12px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr>
          <td style="padding-bottom:16px;">
            <img src="${img}" alt="Convite ${evento.aniversariante}" width="480" style="width:100%;max-width:480px;border-radius:12px;display:block;" />
          </td>
        </tr>
        <tr>
          <td style="background:#fffbf9;border:2px solid #e8b4c8;border-radius:12px;padding:28px 24px;color:#4a2c3d;">
            <p style="margin:0 0 8px;font-size:13px;color:#5a7d62;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${evento.titulo}</p>
            <h1 style="margin:0 0 16px;font-size:24px;color:#8f2d54;">Olá, ${nome}!</h1>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#6d4f5e;">
              Será um prazer ter você conosco para celebrar o aniversário da <strong style="color:#4a2c3d;">${evento.aniversariante}</strong>.
            </p>
            <p style="margin:0 0 8px;font-size:15px;color:#4a2c3d;"><strong style="color:#5a7d62;">Data:</strong> ${evento.data}</p>
            <p style="margin:0 0 8px;font-size:15px;color:#4a2c3d;"><strong style="color:#5a7d62;">Horário:</strong> ${evento.hora}</p>
            <p style="margin:0 0 24px;font-size:15px;color:#4a2c3d;"><strong style="color:#5a7d62;">Local:</strong> ${evento.local}</p>
            <p style="margin:0 0 16px;font-size:16px;color:#4a2c3d;">Por favor, confirme sua presença:</p>
            <a href="${link}" style="display:inline-block;background:#b83a6b;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:bold;">Confirmar presença</a>
            <p style="margin:24px 0 0;font-size:13px;color:#a08090;line-height:1.5;">
              Se o botão não funcionar, copie e cole este link no navegador:<br/>
              <a href="${link}" style="color:#b83a6b;word-break:break-all;">${link}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding-top:16px;text-align:center;font-size:15px;color:#6d4f5e;font-style:italic;">
            Será um prazer contar com a sua presença!
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function montarEmailTexto(convidado, evento) {
  return `Olá, ${convidado.nome}!

Você está convidado(a) para o ${evento.titulo} da ${evento.aniversariante}.

Data: ${evento.data}
Horário: ${evento.hora}
Local: ${evento.local}

Confirme sua presença acessando o link:
${convidado.link}

Será um prazer contar com a sua presença!`;
}
