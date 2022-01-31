import electronMock from '../libs/electron-mock';

type MenuId =
  | 'NEW_ENVIRONMENT_CLIPBOARD'
  | 'NEW_ROUTE_CLIPBOARD'
  | 'IMPORT_OPENAPI_FILE'
  | 'OPEN_SETTINGS'
  | 'EXPORT_OPENAPI_FILE';

class Menu {
  public async click(menuId: MenuId) {
    await electronMock.call(`/menu#${menuId}#`);
  }
}

export default new Menu();
