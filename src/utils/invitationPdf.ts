import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { Person, Team } from "@/types/models";

pdfMake.addVirtualFileSystem(pdfFonts);

function personName(persons: Person[], id: string): string {
  return persons.find((p) => p.id === id)?.name ?? id;
}

/**
 * PDF: A4 quer, pro Team eine Seite (ggf. mehrere bei langem Text),
 * linke Spalte = Einladung Partner 1, rechte Spalte = Partner 2.
 */
export function downloadTeamInvitationsPdf(
  teams: Team[],
  persons: Person[],
  generatedInvitations: Record<string, string>,
  filename = "einladungen_teams.pdf"
): void {
  const sortedTeams = [...teams].sort((a, b) => {
    const n1 = personName(persons, a.person1Id);
    const n2 = personName(persons, b.person1Id);
    return n1.localeCompare(n2, "de", { sensitivity: "base" });
  });

  const content: TDocumentDefinitions["content"] = [];

  sortedTeams.forEach((team, index) => {
    const left = generatedInvitations[team.person1Id] ?? "";
    const right = generatedInvitations[team.person2Id] ?? "";

    content.push({
      columns: [
        {
          width: "50%",
          stack: [{ text: left, style: "invitationText" }],
        },
        {
          width: "50%",
          stack: [{ text: right, style: "invitationText" }],
        },
      ],
      columnGap: 12,
      ...(index < sortedTeams.length - 1 ? { pageBreak: "after" as const } : {}),
    });
  });

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [36, 36, 36, 36],
    defaultStyle: {
      font: "Roboto",
    },
    styles: {
      invitationText: {
        fontSize: 10,
        lineHeight: 1.2,
        preserveTrailingSpaces: true,
      },
    },
    content:
      content.length > 0
        ? content
        : [{ text: "Keine Teams vorhanden.", style: "invitationText" }],
  };

  pdfMake.createPdf(docDefinition).download(filename);
}
