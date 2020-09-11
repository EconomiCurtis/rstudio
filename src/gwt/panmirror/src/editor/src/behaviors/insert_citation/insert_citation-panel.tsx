/*
 * insert_citation_picker.ts
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


import React from "react";

import { Node as ProsemirrorNode } from 'prosemirror-model';

import { EditorUI } from "../../api/ui";
import { WidgetProps } from "../../api/widgets/react";
import { TagInput, TagItem } from "../../api/widgets/tag-input";
import { NavigationTreeNode, containsChild, NavigationTree } from "../../api/widgets/navigation-tree";
import { DialogButtons } from "../../api/widgets/dialog-buttons";
import { BibliographyFile, BibliographySource, BibliographyManager } from "../../api/bibliography/bibliography";
import { kLocalBiliographyProviderKey } from "../../api/bibliography/bibliography-provider_local";

import { CitationBibliographyPicker } from "./insert_citation-bibliography-picker";

import './insert_citation-panel.css';
import { EditorServer } from "../../api/server";
import { bibliographySourcePanel } from "./source_panels/insert_citation-source-panel-bibliography";
import ReactDOM from "react-dom";
import { crossrefSourcePanel } from "./source_panels/insert_citation-source-panel-crossref";


// When the dialog has completed, it will return this result
// If the dialog is canceled no result will be returned
export interface InsertCitationDialogResult {
  citations: CitationListEntry[];
  bibliography: BibliographyFile;
  selectedNode?: NavigationTreeNode;
}

export async function showInsertCitationDialog(
  ui: EditorUI,
  doc: ProsemirrorNode,
  bibliographyManager: BibliographyManager,
  server: EditorServer,
  intiallySelectedNode?: NavigationTreeNode,
): Promise<InsertCitationDialogResult | undefined> {

  let result: InsertCitationDialogResult | undefined;

  // Render the element into the window
  const performInsert = await ui.dialogs.htmlDialog(
    "Insert Citation",
    "Insert",
    (containerWidth: number, containerHeight: number, confirm: VoidFunction, cancel: VoidFunction) => {

      const kMaxHeight = 650;
      const kMaxWidth = 900;
      const kMaxHeightProportion = .9;
      const kdialogPaddingIncludingButtons = 70;

      const windowHeight = containerHeight;
      const windowWidth = containerWidth;

      const height = Math.min(kMaxHeight, windowHeight * kMaxHeightProportion - kdialogPaddingIncludingButtons);
      const width = Math.max(Math.min(kMaxWidth, windowWidth * .9), 550);

      const container = window.document.createElement('div');
      container.className = 'pm-default-theme';

      const bibliographyFiles = bibliographyManager.writableBibliographyFiles(doc, ui);

      const providersForBibliography = () => {
        // TODO: Should I optimize this a little bit (e.g. no need to pass doc/ui)?
        const isWritable = bibliographyManager.writableBibliographyFiles(doc, ui).length > 0;
        return isWritable ? [
          bibliographySourcePanel(doc, ui, bibliographyManager),
          crossrefSourcePanel(ui, bibliographyManager, server.crossref, server.doi)] :
          [bibliographySourcePanel(doc, ui, bibliographyManager)];

        // doiSourcePanel(ui, server.doi),
      };

      // Provide a configuration stream that will update after the bibliography loads
      let updatedConfiguration: InsertCitationPanelConfiguration | undefined;
      const configurationStream: InsertCitationPanelConfigurationStream = {
        current: {
          providers: providersForBibliography(),
          bibliographyFiles
        },
        stream: () => {
          return updatedConfiguration || null;
        }
      };

      // Load the bibliography and then update the configuration
      bibliographyManager.load(ui, doc).then(() => {
        updatedConfiguration = {
          providers: providersForBibliography(),
          bibliographyFiles: bibliographyManager.writableBibliographyFiles(doc, ui)
        };
      });

      const onOk = (citations: CitationListEntry[], bibliography: BibliographyFile, selectedNode: NavigationTreeNode) => {
        result = {
          citations,
          bibliography,
          selectedNode
        };
        confirm();
      };

      const onCancel = () => {
        result = undefined;
        cancel();
      };

      container.style.width = width + 'px';
      ReactDOM.render(
        <InsertCitationPanel
          height={height}
          width={width}
          configuration={configurationStream}
          initiallySelectedNode={intiallySelectedNode}
          onOk={onOk}
          onCancel={onCancel}
          doc={doc}
          ui={ui}
        />
        , container);
      return container;

    },
    () => {
      // TODO: Focus the correct control (text filtering)?
    },
    () => {
      if (result && result.citations.length === 0) {
        return "Please select a citation to insert.";
      }
      return null;
    });

  if (performInsert && result) {
    console.log("INSERT");
    return Promise.resolve(result);
  } else {
    console.log("CANCEL");
    return Promise.resolve(undefined);
  }
}


export interface InsertCitationPanelConfiguration {
  providers: CitationSourcePanelProvider[];
  bibliographyFiles: BibliographyFile[];
}

export interface InsertCitationPanelConfigurationStream {
  current: InsertCitationPanelConfiguration;
  stream: () => (InsertCitationPanelConfiguration | null);
}

// Citation Panels Providers are the core element of ths dialog. Each provider provides
// the main panel UI as well as the tree to display when the panel is displayed.
export interface CitationSourcePanelProvider { // CitationSourcePanelProvider
  key: string;
  panel: React.FC<CitationSourcePanelProps>;
  treeNode(): NavigationTreeNode;
  typeAheadSearch: (term: string, selectedNode: NavigationTreeNode) => CitationListEntry[] | null;
  search: (term: string, selectedNode: NavigationTreeNode) => Promise<CitationListEntry[] | null>;
}

export interface CitationListEntry {
  id: string;
  authors: (width: number) => string;
  date: string;
  journal: string | undefined;
  title: string;
  providerKey: string;
  image?: string;
  imageAdornment?: string;
  toBibliographySource: () => Promise<BibliographySource>;
}

// Panels get a variety of information as properties to permit them to search
// citations and add them
export interface CitationSourcePanelProps extends WidgetProps {
  ui: EditorUI;
  height: number;

  searchTerm: string;
  onSearchTermChanged: (term: string) => void;
  onExecuteSearch: () => void;

  citations: CitationListEntry[];
  citationsToAdd: CitationListEntry[];

  // TODO: could be indexes
  onAddCitation: (citation: CitationListEntry) => void;
  onRemoveCitation: (citation: CitationListEntry) => void;
  onConfirm: VoidFunction;

  selectedIndex: number;
  onSelectedIndexChanged: (index: number) => void;

  ref: React.Ref<any>;
}

// The picker is a full featured UI for finding and selecting citation data
// to be added to a document.
interface InsertCitationPanelProps extends WidgetProps {
  ui: EditorUI;
  doc: ProsemirrorNode;
  height: number;
  width: number;
  configuration: InsertCitationPanelConfigurationStream;
  initiallySelectedNode?: NavigationTreeNode;
  onOk: (citations: CitationListEntry[], bibliography: BibliographyFile, selectedNode: NavigationTreeNode) => void;
  onCancel: () => void;
}

interface InsertCitationPanelState {
  citations: CitationListEntry[];
  citationsToAdd: CitationListEntry[];
  selectedIndex: number;
  searchTerm: string;
  selectedNode: NavigationTreeNode;
}

interface InsertCitationPanelUpdateState {
  citations?: CitationListEntry[];
  citationsToAdd?: CitationListEntry[];
  selectedIndex?: number;
  searchTerm?: string;
  selectedNode?: NavigationTreeNode;
}

export const InsertCitationPanel: React.FC<InsertCitationPanelProps> = props => {

  // The configuration of this panel
  const [insertCitationConfiguration, setInsertCitationConfiguration] = React.useState<InsertCitationPanelConfiguration>(props.configuration.current);

  // Finds the panel associated with the selected tree node
  const panelForNode = (sourcePanels: CitationSourcePanelProvider[], node?: NavigationTreeNode) => {
    if (node) {
      const panelItem = sourcePanels.find(panel => {
        const panelTreeNode = panel.treeNode();
        return containsChild(node.key, panelTreeNode);
      });
      return panelItem;
    } else {
      return undefined;
    }
  };

  // TODO: Consider a single configuration state that can be passed or streamed in
  const [bibliographyFile, setBibliographyFile] = React.useState<BibliographyFile>();
  const [selectedPanelProvider, setSelectedPanelProvider] = React.useState<CitationSourcePanelProvider>(panelForNode(insertCitationConfiguration.providers, props.initiallySelectedNode) || insertCitationConfiguration.providers[0]);

  // The source data for the tree
  const treeSourceData = insertCitationConfiguration.providers.map(panel => panel.treeNode());

  // Holder of the dialog state
  const [insertCitationPanelState, setInsertCitationPanelState] = React.useState<InsertCitationPanelState>(
    {
      citations: [],
      citationsToAdd: [],
      selectedIndex: -1,
      searchTerm: '',
      selectedNode: props.initiallySelectedNode || selectedPanelProvider.treeNode(),
    }
  );

  // Core method to update state
  const updateState = (updatedState: InsertCitationPanelUpdateState) => {
    const newState = {
      ...insertCitationPanelState,
      ...updatedState
    };
    setInsertCitationPanelState(newState);
  };

  const onOk = () => {
    // TODO: bibliography file could not be specified? (!!!)
    // TODO: need to include selected citation in citations returned here
    props.onOk(insertCitationPanelState.citationsToAdd, bibliographyFile!, insertCitationPanelState.selectedNode);
  };

  // The initial setting of focus and loading of data for the panel. 
  const panelRef = React.useRef<any>(undefined);
  React.useEffect(() => {
    // Set initial focus
    if (panelRef.current) {
      setTimeout(() => {
        panelRef.current.focus();
      }, 200);
    }

    // Poll the configuration stream for updates
    setInterval(() => {
      const result = props.configuration.stream();
      if (result !== null) {
        setInsertCitationConfiguration(result);
        clearInterval();
      }
    }, 200);

    const value = selectedPanelProvider.typeAheadSearch('', insertCitationPanelState.selectedNode);
    updateState({ searchTerm: '', citations: value || [] });
  }, []);

  // Style properties
  const style: React.CSSProperties = {
    width: props.width + 'px',
    ...props.style,
  };

  // Figure out the panel height (the height of the main panel less padding and other elements)
  const panelHeight = props.height * .75;

  // Merge the selected citation into the list that is displayed for add and filter it 
  // out of the citation list itself
  const mergeCitations = (toAdd: CitationListEntry[], selected?: CitationListEntry) => {
    if (!selected) {
      return toAdd;
    } else {
      if (toAdd.map(citation => citation.id).includes(selected.id)) {
        return toAdd;
      } else {
        return (toAdd || []).concat(selected);
      }
    }
  };
  const displayedCitations = insertCitationPanelState.citations.filter(citation => !insertCitationPanelState.citationsToAdd.includes(citation));
  const selectedCitation = insertCitationPanelState.selectedIndex > -1 ? displayedCitations[insertCitationPanelState.selectedIndex] : undefined;
  const mergedCitationsToAdd = mergeCitations(insertCitationPanelState.citationsToAdd, selectedCitation);

  // Load the panel that is displayed for the selected node
  const citationProps: CitationSourcePanelProps = {
    ui: props.ui,
    height: panelHeight,
    citations: displayedCitations,
    citationsToAdd: mergedCitationsToAdd,
    searchTerm: insertCitationPanelState.searchTerm,
    onSearchTermChanged: (term: string) => {
      updateState({ searchTerm: term });
      const value = selectedPanelProvider.typeAheadSearch(term, insertCitationPanelState.selectedNode);
      if (value) {
        updateState({ citations: value, searchTerm: term });
      }
    },
    onExecuteSearch: () => {
      selectedPanelProvider.search(insertCitationPanelState.searchTerm, insertCitationPanelState.selectedNode).then((value) => {
        if (value) {
          updateState({ citations: value });
        }
      });
    },
    onAddCitation: (citation: CitationListEntry) => {
      const newCitations = [...insertCitationPanelState.citationsToAdd, citation];
      updateState({ selectedIndex: -1, citationsToAdd: newCitations });
    },
    onRemoveCitation: (citation: CitationListEntry) => {
      deleteCitation(citation.id);
    },
    selectedIndex: insertCitationPanelState.selectedIndex,
    onSelectedIndexChanged: (index: number) => {
      updateState({ selectedIndex: index });
    },
    onConfirm: onOk,
    ref: panelRef
  };


  // Create the panel that should be displayed for the selected node of the tree
  const panelToDisplay = selectedPanelProvider ? React.createElement(selectedPanelProvider.panel, citationProps) : undefined;

  const onNodeSelected = (node: NavigationTreeNode) => {
    const value = selectedPanelProvider.typeAheadSearch('', node);
    const suggestedPanel = panelForNode(insertCitationConfiguration.providers, node);
    if (suggestedPanel && suggestedPanel?.key !== selectedPanelProvider?.key) {
      setSelectedPanelProvider(suggestedPanel);
    }
    updateState({ searchTerm: '', citations: value || [], selectedIndex: -1, selectedNode: node });
  };

  const deleteCitation = (id: string) => {
    const filteredCitations = insertCitationPanelState.citationsToAdd.filter(source => source.id !== id);
    updateState({ citationsToAdd: filteredCitations });
  };

  const deleteTag = (tag: TagItem) => {
    deleteCitation(tag.key);
  };

  const tagEdited = (key: string, text: string) => {
    const targetSource = insertCitationPanelState.citationsToAdd.find(source => source.id === key);
    if (targetSource) {
      targetSource.id = text;
    }
  };

  const bibliographyFileChanged = (biblographyFile: BibliographyFile) => {
    setBibliographyFile(bibliographyFile);
  };

  // Support keyboard shortcuts for dismissing dialog
  const onKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onOk();
    }
  };

  // Esc can cause loss of focus so catch it early
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      props.onCancel();
    }
  };


  return (
    <div className='pm-cite-panel-container' style={style} onKeyPress={onKeyPress} onKeyDown={onKeyDown}>

      <div className='pm-cite-panel-cite-selection'>
        <div className='pm-cite-panel-cite-selection-sources pm-block-border-color pm-background-color'>
          <NavigationTree
            height={panelHeight}
            nodes={treeSourceData}
            selectedNode={insertCitationPanelState.selectedNode}
            onNodeSelected={onNodeSelected}
          />
        </div>
        <div className='pm-cite-panel-cite-selection-items'>
          {panelToDisplay}
        </div>
      </div>
      <div
        className='pm-cite-panel-selected-cites pm-block-border-color pm-background-color'
      >
        <TagInput
          tags={mergedCitationsToAdd.map(source => ({
            key: source.id,
            displayText: source.id,
            displayPrefix: '@',
            isEditable: source.providerKey !== kLocalBiliographyProviderKey,
          }))}
          tagDeleted={deleteTag}
          tagChanged={tagEdited}
          ui={props.ui}
          placeholder={props.ui.context.translateText('Selected Citation Keys')} />
      </div>
      <div className='pm-cite-panel-select-bibliography'>
        <CitationBibliographyPicker
          bibliographyFiles={insertCitationConfiguration.bibliographyFiles}
          biblographyFileChanged={bibliographyFileChanged}
          ui={props.ui} />

        <DialogButtons
          okLabel={props.ui.context.translateText('Insert')}
          cancelLabel={props.ui.context.translateText('Cancel')}
          onOk={onOk}
          onCancel={props.onCancel} />
      </div>
    </div>
  );
};

