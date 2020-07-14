/*
 * bibliography-provider_local.ts
 *
 * Copyright (C) 2020 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';

import { PandocServer } from "../pandoc";

import { expandPaths } from "../path";
import { EditorUI } from "../ui";

import { BibliographyDataProvider, Bibliography } from "./bibliography";
import { ParsedYaml, parseYamlNodes } from '../yaml';

export interface BibliographyResult {
  etag: string;
  bibliography: Bibliography;
}

export class BibliographyDataProviderLocal implements BibliographyDataProvider {

  private etag: string;
  private biblio?: Bibliography;
  private readonly server: PandocServer;

  public constructor(server: PandocServer) {
    this.server = server;
    this.etag = '';
  }

  public async load(docPath: string, resourcePath: string, yamlBlocks: ParsedYaml[]): Promise<boolean> {
    // Gather the biblography files from the document
    const bibliographiesRelative = bibliographyFilesFromDoc(yamlBlocks);
    const bibliographiesAbsolute = expandPaths(resourcePath, bibliographiesRelative || []);

    // Gather the reference block
    const refBlock = referenceBlockFromYaml(yamlBlocks);

    let updateIndex = false;
    if (docPath || bibliographiesAbsolute.length > 0 || refBlock) {
      // get the bibliography
      const result = await this.server.getBibliography(docPath, bibliographiesAbsolute, refBlock, this.etag);

      // Read bibliography data from files (via server)
      if (!this.bibliography || result.etag !== this.etag) {
        this.biblio = result.bibliography;
        updateIndex = true;
      }

      // record the etag for future queries
      this.etag = result.etag;
    }
    return updateIndex;
  }

  public bibliography(): Bibliography {
    return this.biblio || { sources: [], project_biblios: [] };
  }
}

export function bibliographyPaths(doc: ProsemirrorNode): string[] | undefined {
  // Gather the files from the document
  return bibliographyFilesFromDoc(parseYamlNodes(doc));
}

function bibliographyFilesFromDoc(parsedYamls: ParsedYaml[]): string[] | undefined {
  const bibliographyParsedYamls = parsedYamls.filter(
    parsedYaml => parsedYaml.yaml !== null && typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.bibliography,
  );

  // Look through any yaml nodes to see whether any contain bibliography information
  if (bibliographyParsedYamls.length > 0) {
    // Pandoc will use the last biblography node when generating a bibliography.
    // So replicate this and use the last biblography node that we find
    const bibliographyParsedYaml = bibliographyParsedYamls[bibliographyParsedYamls.length - 1];
    const bibliographyFiles = bibliographyParsedYaml.yaml.bibliography;

    if (
      Array.isArray(bibliographyFiles) &&
      bibliographyFiles.every(bibliographyFile => typeof bibliographyFile === 'string')) {
      return bibliographyFiles;
    } else {
      // A single bibliography
      return [bibliographyFiles];
    }
  }
  return undefined;
}

function referenceBlockFromYaml(parsedYamls: ParsedYaml[]): string {
  const refBlockParsedYamls = parsedYamls.filter(
    parsedYaml => parsedYaml.yaml !== null && typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.references,
  );

  // Pandoc will use the last references node when generating a bibliography.
  // So replicate this and use the last biblography node that we find
  if (refBlockParsedYamls.length > 0) {
    const lastReferenceParsedYaml = refBlockParsedYamls[refBlockParsedYamls.length - 1];
    if (lastReferenceParsedYaml) {
      return lastReferenceParsedYaml.yamlCode;
    }
  }

  return '';
}



const kSpaceOrColonRegex = /[\s:]/;
function bibliographyLine(bibliographyFile: string): string {
  const sketchyCharMatch = bibliographyFile.match(kSpaceOrColonRegex);
  if (sketchyCharMatch) {
    return `bibliography: "${bibliographyFile}"\n`;
  } else {
    return `bibliography: ${bibliographyFile}\n`;
  }
}

export function ensureBibliographyFileForDoc(tr: Transaction, bibliographyFile: string, ui: EditorUI) {

  // read the Yaml blocks from the document
  const parsedYamlNodes = parseYamlNodes(tr.doc);

  // Gather the biblography files from the document
  const bibliographiesRelative = bibliographyFilesFromDoc(parsedYamlNodes);
  if (bibliographiesRelative && bibliographiesRelative.length > 0) {
    // The user selected bibliography is already in the document OR
    // There is a bibliography entry, but it doesn't include the user
    // selected bibliography. In either case, we're not going to write
    // a bibliography entry to any YAML node. 
    return bibliographiesRelative.includes(bibliographyFile);
  } else {
    // There aren't any bibliographies declared for this document yet either because
    // there are no yaml metadata blocks or the yaml metadata blocks that exist omit
    // the bibliography property
    if (parsedYamlNodes.length === 0) {
      // There aren't any yaml nodes in this document, need to create one
      const biblioNode = createBiblographyYamlNode(tr.doc.type.schema, bibliographyFile);
      tr.insert(1, biblioNode);

    } else {

      // We found at least one node in the document, add to the first node that we found
      const firstBlock = parsedYamlNodes[0];
      const updatedNode = addBibliographyToYamlNode(tr.doc.type.schema, bibliographyFile, firstBlock);
      tr.replaceRangeWith(firstBlock.node.pos, firstBlock.node.pos + firstBlock.node.node.nodeSize, updatedNode);

    }
    return true;
  }
}


function addBibliographyToYamlNode(schema: Schema, bibliographyFile: string, parsedYaml: ParsedYaml) {
  // Add this to the first node
  const yamlCode = parsedYaml.yamlCode;
  const yamlWithBib = `---${yamlCode}${bibliographyLine(bibliographyFile)}---`;
  const yamlText = schema.text(yamlWithBib);
  return schema.nodes.yaml_metadata.create({}, yamlText);
}

function createBiblographyYamlNode(schema: Schema, bibliographyFile: string) {
  const yamlText = schema.text(`---${bibliographyLine(bibliographyFile)}---`);
  return schema.nodes.yaml_metadata.create({}, yamlText);
}

