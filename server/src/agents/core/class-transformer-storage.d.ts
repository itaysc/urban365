declare module 'class-transformer/cjs/storage.js' {
  export const defaultMetadataStorage: {
    findTypeMetadata(
      target: Function,
      propertyName: string,
    ): { typeFunction?: () => new () => object } | undefined;
  };
}
