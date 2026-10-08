import { describe, expect, it } from "vitest";

import { pageXmlToLayout } from "./pageXml";

// The shape eynollah writes (PAGE 2019): a namespace, a reading order, text regions with
// lines, a heading, a separator and an image.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15">
  <Metadata><Creator>SBB_QURATOR</Creator><Created>2026-10-08T10:00:00</Created></Metadata>
  <Page imageFilename="images/issue_001-02.png" imageWidth="2000" imageHeight="3000">
    <ReadingOrder><OrderedGroup id="ro1">
      <RegionRefIndexed index="0" regionRef="r_head"/>
      <RegionRefIndexed index="1" regionRef="r_body"/>
    </OrderedGroup></ReadingOrder>
    <TextRegion id="r_body">
      <Coords points="100,500 900,500 900,1200 100,1200"/>
      <TextLine id="l1"><Coords points="110,510 890,510 890,560 110,560"/><TextEquiv><Unicode>a &amp; b</Unicode></TextEquiv></TextLine>
      <TextLine id="l2"><Coords points="110,570 880,570 880,620 110,620"/></TextLine>
    </TextRegion>
    <TextRegion id="r_head" type="heading">
      <Coords points="100,100 1900,100 1900,300 100,300"/>
    </TextRegion>
    <SeparatorRegion id="s1"><Coords points="950,400 960,400 960,2900 950,2900"/></SeparatorRegion>
    <ImageRegion id="i1"><Coords points="1000,500 1800,500 1800,1500 1000,1500"/></ImageRegion>
  </Page>
</PcGts>`;

describe("PAGE-XML to the newspaper layout", () => {
  it("makes every region a block with its lines, in document order", () => {
    const l = pageXmlToLayout(XML);
    expect([l.width, l.height, l.page, l.n_regions]).toEqual([2000, 3000, "issue_001-02", 6]);
    expect(l.regions.map((r) => [r.level, r.block, r.label, r.xml_id])).toEqual([
      ["block", 1, "text", "r_body"],
      ["line", 1, "", "l1"],
      ["line", 1, "", "l2"],
      ["block", 2, "text:heading", "r_head"],
      ["block", 3, "separator", "s1"],
      ["block", 4, "image", "i1"],
    ]);
    expect(l.regions[0].bbox).toEqual([100, 500, 900, 1200]);
    expect(l.regions[1].bbox).toEqual([110, 510, 890, 560]);
  });

  it("carries the reading order where the file gives one", () => {
    const l = pageXmlToLayout(XML);
    expect(l.regions.filter((r) => r.level === "block").map((r) => r.reading_order)).toEqual([2, 1, null, null]);
  });

  it("reads a namespace prefix and legacy Point coordinates", () => {
    const old = `<pc:PcGts xmlns:pc="x"><pc:Page imageWidth="10" imageHeight="20"><pc:TextRegion id="a" type="drop-capital"><pc:Coords><pc:Point x="1" y="2"/><pc:Point x="5" y="9"/></pc:Coords></pc:TextRegion></pc:Page></pc:PcGts>`;
    const l = pageXmlToLayout(old, "p1");
    expect(l.page).toBe("p1");
    expect(l.regions).toEqual([{ level: "block", block: 1, label: "text:drop-capital", bbox: [1, 2, 5, 9], reading_order: null, xml_id: "a", score: null }]);
  });

  it("refuses a file that is not PAGE", () => {
    expect(() => pageXmlToLayout("<alto><Layout/></alto>")).toThrow(/no <Page>/);
    expect(() => pageXmlToLayout("<PcGts><Page/></PcGts>")).toThrow(/imageWidth/);
  });
});
