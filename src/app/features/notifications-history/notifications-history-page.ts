import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/data/db.service';

@Component({
  selector: 'app-notifications-history-page',
  imports: [RouterLink],
  templateUrl: './notifications-history-page.html',
})
export class NotificationsHistoryPage {
  protected readonly db = inject(DbService);

  protected async markRead(id: number | undefined): Promise<void> {
    if (id == null) {
      return;
    }
    await this.db.markNotificationRead(id);
  }

  protected async clearAll(): Promise<void> {
    await this.db.clearNotifications();
  }
}
