/**
 * The fixed parts of a VSDX package.
 *
 * Everything here is Visio format boilerplate — the container's relationship
 * graph, content types, document-level stylesheets, and the "Dynamic
 * connector" master that connector shapes inherit from. It is modelled on the
 * package draw.io's own VSDX exporter emits, which is the shape Miro's
 * importer is known to accept. Only pages.xml and page1.xml vary per board.
 */

const NS = "xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'"
const DECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`

export const CONTENT_TYPES = (imageExts: string[]) =>
  `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Default Extension="jpg" ContentType="image/jpeg"/>` +
  `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
  `<Default Extension="gif" ContentType="image/gif"/>` +
  `<Default Extension="svg" ContentType="image/svg+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>` +
  `<Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>` +
  `<Override PartName="/visio/masters/master1.xml" ContentType="application/vnd.ms-visio.master+xml"/>` +
  `<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>` +
  `<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>` +
  `<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>` +
  `</Types>`

export const ROOT_RELS =
  `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`

export const DOC_RELS =
  `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>` +
  `</Relationships>`

export const PAGES_RELS =
  `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>` +
  `</Relationships>`

export const MASTERS_RELS =
  `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="master1.xml"/>` +
  `</Relationships>`

export const APP_XML =
  `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
  `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
  `<Application>Microsoft Visio</Application><AppVersion>15.0000</AppVersion></Properties>`

export const CORE_XML = (title: string) =>
  `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
  `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
  `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
  `<dc:title>${title}</dc:title><dc:creator>Goya</dc:creator><cp:lastModifiedBy>Goya</cp:lastModifiedBy>` +
  `</cp:coreProperties>`

export const WINDOWS_XML = `${DECL}<Windows ClientWidth="1000" ClientHeight="800" ${NS} xml:space="preserve"/>`

/**
 * Document stylesheets. Visio resolves every shape's inherited formatting
 * through these; DocumentSettings names which ones are the defaults, so the
 * ids referenced there (3 for text/line/fill, 4 for guides) must exist.
 */
const STYLE = (id: string, name: string, extra = '') =>
  `<StyleSheet ID="${id}" NameU="${name}" Name="${name}" LineStyle="${id}" FillStyle="${id}" TextStyle="${id}">` +
  `<Cell N="LineWeight" V="0.01"/><Cell N="LineColor" V="#000000"/><Cell N="LinePattern" V="1"/>` +
  `<Cell N="FillForegnd" V="#ffffff"/><Cell N="FillBkgnd" V="#ffffff"/><Cell N="FillPattern" V="1"/>` +
  `<Cell N="BeginArrow" V="0"/><Cell N="EndArrow" V="0"/><Cell N="TextBkgnd" V="0"/>` +
  `<Section N="Character"><Row IX="0"><Cell N="Font" V="Arial"/><Cell N="Color" V="#000000"/>` +
  `<Cell N="Size" V="0.1666666666666667"/><Cell N="Style" V="0"/></Row></Section>` +
  `<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="1"/></Row></Section>` +
  extra +
  `</StyleSheet>`

export const DOCUMENT_XML =
  `${DECL}<VisioDocument ${NS} xml:space="preserve">` +
  `<DocumentSettings TopPage="0" DefaultTextStyle="3" DefaultLineStyle="3" DefaultFillStyle="3" DefaultGuideStyle="4">` +
  `<GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><SnapExtensions>34</SnapExtensions>` +
  `<DynamicGridEnabled>1</DynamicGridEnabled><ProtectStyles>0</ProtectStyles><ProtectShapes>0</ProtectShapes>` +
  `<ProtectMasters>0</ProtectMasters><ProtectBkgnds>0</ProtectBkgnds></DocumentSettings>` +
  `<Colors><ColorEntry IX="24" RGB="#000000"/><ColorEntry IX="25" RGB="#FFFFFF"/></Colors>` +
  `<FaceNames><FaceName NameU="Arial" UnicodeRanges="31367 -2147483648 8 0" CharSets="1073742335 -65536" Panos="2 11 6 4 2 2 2 2 2 4" Flags="325"/>` +
  `<FaceName NameU="Helvetica" UnicodeRanges="31367 -2147483648 8 0" CharSets="1073742335 -65536" Panos="2 11 6 4 2 2 2 2 2 4" Flags="325"/></FaceNames>` +
  `<StyleSheets>` +
  STYLE('0', 'No Style') +
  STYLE('1', 'Text Only') +
  STYLE('2', 'None') +
  STYLE('3', 'Normal') +
  STYLE('4', 'Guide') +
  STYLE('7', 'Connector') +
  `</StyleSheets>` +
  `<DocumentSheet NameU="TheDoc" LineStyle="0" FillStyle="0" TextStyle="0">` +
  `<Cell N="OutputFormat" V="0"/><Cell N="LockPreview" V="0"/><Cell N="AddMarkup" V="0"/>` +
  `<Cell N="ViewMarkup" V="0"/><Cell N="PreviewQuality" V="0"/><Cell N="PreviewScope" V="0"/>` +
  `<Cell N="DocLangID" V="en-US"/></DocumentSheet>` +
  `</VisioDocument>`

/** The stock Visio "Dynamic connector" master that connectors inherit. */
export const MASTERS_XML =
  `${DECL}<Masters ${NS} xml:space="preserve">` +
  `<Master ID="4" NameU="Dynamic connector" IsCustomNameU="1" Name="Dynamic connector" IsCustomName="1" ` +
  `Prompt="This connector automatically routes between the shapes it connects." IconSize="1" AlignName="2" ` +
  `MatchByName="1" IconUpdate="0" UniqueID="{002A9108-0000-0000-8E40-00608CF305B2}" ` +
  `BaseID="{F7290A45-E3AD-11D2-AE4F-006008C9F5A9}" PatternFlags="0" Hidden="0" MasterType="0">` +
  `<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">` +
  `<Cell N="PageWidth" V="3"/><Cell N="PageHeight" V="3"/><Cell N="PageScale" V="1" U="IN_F"/>` +
  `<Cell N="DrawingScale" V="1" U="IN_F"/><Cell N="DrawingSizeType" V="4"/><Cell N="DrawingScaleType" V="0"/>` +
  `<Section N="Layer"><Row IX="0"><Cell N="Name" V="Connector"/><Cell N="Color" V="255"/><Cell N="Status" V="0"/>` +
  `<Cell N="Visible" V="1"/><Cell N="Print" V="1"/><Cell N="Active" V="0"/><Cell N="Lock" V="0"/>` +
  `<Cell N="Snap" V="1"/><Cell N="Glue" V="1"/><Cell N="NameUniv" V="Connector"/><Cell N="ColorTrans" V="0"/>` +
  `</Row></Section></PageSheet><Rel r:id="rId1"/></Master></Masters>`

export const MASTER1_XML =
  `${DECL}<MasterContents ${NS} xml:space="preserve"><Shapes>` +
  `<Shape ID="5" OriginalID="0" Type="Shape" LineStyle="7" FillStyle="7" TextStyle="7">` +
  `<Cell N="PinX" V="1.5" F="GUARD((BeginX+EndX)/2)"/><Cell N="PinY" V="1.5" F="GUARD((BeginY+EndY)/2)"/>` +
  `<Cell N="Width" V="1" F="GUARD(EndX-BeginX)"/><Cell N="Height" V="-1" F="GUARD(EndY-BeginY)"/>` +
  `<Cell N="LocPinX" V="0.5" F="GUARD(Width*0.5)"/><Cell N="LocPinY" V="-0.5" F="GUARD(Height*0.5)"/>` +
  `<Cell N="Angle" V="0" F="GUARD(0DA)"/><Cell N="FlipX" V="0" F="GUARD(FALSE)"/><Cell N="FlipY" V="0" F="GUARD(FALSE)"/>` +
  `<Cell N="ResizeMode" V="0"/><Cell N="BeginX" V="1"/><Cell N="BeginY" V="2"/><Cell N="EndX" V="2"/><Cell N="EndY" V="1"/>` +
  `<Cell N="LockHeight" V="1"/><Cell N="LockCalcWH" V="1"/><Cell N="NoAlignBox" V="1"/><Cell N="DynFeedback" V="2"/>` +
  `<Cell N="GlueType" V="2"/><Cell N="ObjType" V="2"/><Cell N="NoLiveDynamics" V="1"/><Cell N="ShapeSplittable" V="1"/>` +
  `<Cell N="LayerMember" V="0"/>` +
  `<Section N="Geometry" IX="0"><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/><Cell N="NoShow" V="0"/>` +
  `<Cell N="NoSnap" V="0"/><Cell N="NoQuickDrag" V="0"/>` +
  `<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
  `<Row T="LineTo" IX="2"><Cell N="X" V="0"/><Cell N="Y" V="-1"/></Row></Section>` +
  `</Shape></Shapes></MasterContents>`

export const PAGES_XML = (widthIn: number, heightIn: number) =>
  `${DECL}<Pages ${NS}><Page ID="0" NameU="Page-1" Name="Page-1">` +
  `<PageSheet><Cell N="PageWidth" V="${widthIn}"/><Cell N="PageHeight" V="${heightIn}"/>` +
  `<Cell N="PageScale" V="1"/><Cell N="DrawingScale" V="1"/>` +
  `<Section N="Layer"><Row IX="0"><Cell N="Name" V="Background"/><Cell N="Color" V="255"/><Cell N="Status" V="0"/>` +
  `<Cell N="Visible" V="1"/><Cell N="Print" V="1"/><Cell N="Active" V="0"/><Cell N="Lock" V="0"/>` +
  `<Cell N="Snap" V="1"/><Cell N="Glue" V="1"/><Cell N="NameUniv" V="Background"/><Cell N="ColorTrans" V="0"/>` +
  `</Row></Section></PageSheet><Rel r:id="rId1"/></Page></Pages>`
