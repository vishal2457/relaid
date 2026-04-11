export interface TTemplate {
  id?: number;
  template: string;
  resolvedPath: string;
  type?: string;
}

export interface TTemplateFileTree {
  id: string;
  name: string;
  children?: TTemplateFileTree[];
  template?: string;
  type?: string;
  originalMeta?: TTemplate;
}
