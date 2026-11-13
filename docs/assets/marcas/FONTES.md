# Origem dos arquivos de marca

Situação: **aplicação provisória, pendente de aprovação da Comunicação** das duas instituições.
Enquanto `marcasProvisorias: true` estiver em `docs/config.js`, as telas exibem esse aviso.

| Arquivo | Origem | Observações |
|---|---|---|
| `unifasam-pdi.png` (1120 × 600 px, fundo transparente) | Imagem embutida na capa do arquivo `PDI_UNIFASAM_2026-2030_COMPLETO.pdf` (p. 1), extraída sem redesenho; a transparência é a do próprio arquivo. | É a versão com cinco estrelas. Confirmar com a Comunicação se é a assinatura adequada para o evento ou se há versão sem as estrelas. |
| `integra-pdi.png` (1872 × 382 px, fundo transparente) | Imagem `word/media/image1.png` embutida no arquivo `PDI_INTEGRA_2026-2030.docx`, extraída sem redesenho. | Assinatura horizontal com brasão e a denominação "Faculdades Integradas da América do Sul". |

Nenhum manual de marca foi fornecido. Por isso:

- as marcas aparecem sempre sobre cartão branco, com proporção original, margem interna como área de proteção e cartões de tamanho idêntico para as duas instituições;
- nenhuma cor, forma ou tipografia das marcas foi alterada; a interface usa base neutra;
- se uma imagem não carregar, a tela mostra o nome da instituição em texto.

Para substituir: salve os arquivos oficiais nesta pasta com os mesmos nomes (PNG com fundo transparente ou SVG, ajustando a extensão em `docs/js/comum.js`) e mude `marcasProvisorias` para `false`.
